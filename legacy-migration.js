import { auth, db } from './firebase-db.js';
import {
    collection, doc, getDocs, writeBatch
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { requireLoginBeforeLoad, showToast, escapeHtml } from './utils.js';

const ALLOWED_EMAIL = 's96395@gmail.com';
const SUBCOLLECTIONS = ['itinerary', 'expenses', 'todos', 'images', 'diveLogs'];
const BATCH_LIMIT = 450;

const USERS = [
    {
        email: 's96395@gmail.com',
        uid: 'Sy4sFjX88FSJMeutJKCRpgnt9SL2',
        nickname: 'Y SHEN',
        legacyNames: ['Y SHEN', 'YSHEN'],
    },
    {
        email: 'yoyoshen@gis.fcu.edu.tw',
        uid: 'pG6F0S35GcYSpiHFfH88yDogLdq1',
        nickname: '沈Yoyoshen',
        legacyNames: ['沈Yoyoshen'],
    },
    {
        email: 'botakirisme@gmail.com',
        uid: 'iTxvoRPKq1e4qjydsL0aBn5Ek062',
        nickname: 'Iris',
        legacyNames: ['Iris'],
    },
];

const nameToUser = new Map();
for (const user of USERS) {
    for (const name of [user.nickname, ...user.legacyNames]) {
        nameToUser.set(normalizeName(name), user);
    }
}

const accessStatus = document.getElementById('accessStatus');
const migrationPanel = document.getElementById('migrationPanel');
const scanBtn = document.getElementById('scanBtn');
const writeBtn = document.getElementById('writeBtn');
const summaryOutput = document.getElementById('summaryOutput');
const unresolvedList = document.getElementById('unresolvedList');
const counters = {
    scannedTrips: document.getElementById('scannedTrips'),
    tripPatchCount: document.getElementById('tripPatchCount'),
    subPatchCount: document.getElementById('subPatchCount'),
    unresolvedCount: document.getElementById('unresolvedCount'),
};

let latestPlan = null;

init();

async function init() {
    const user = await requireLoginBeforeLoad();
    if (!isAllowedUser(user)) {
        accessStatus.textContent = `拒絕存取：${user.email || '此帳號'} 沒有使用此工具的權限。`;
        accessStatus.style.color = '#e74c3c';
        migrationPanel.style.display = 'none';
        return;
    }

    accessStatus.textContent = `已登入授權帳號：${user.email}。目前為 dry-run，尚未寫入資料。`;
    migrationPanel.style.display = 'block';
    scanBtn.addEventListener('click', () => runMigration(false));
    writeBtn.addEventListener('click', confirmAndWrite);
    await runMigration(false);
}

function isAllowedUser(user) {
    return user?.email?.toLowerCase() === ALLOWED_EMAIL;
}

async function confirmAndWrite() {
    if (!isAllowedUser(auth.currentUser)) {
        showToast('沒有執行 migration 的權限。', 'error');
        return;
    }

    if (!latestPlan) {
        await runMigration(false);
    }

    const totalWrites = (latestPlan?.tripPatches.length || 0) + (latestPlan?.subcollectionPatches.length || 0);
    if (totalWrites === 0) {
        showToast('沒有需要寫入的資料。');
        return;
    }

    const confirmed = window.confirm(`即將寫入 ${totalWrites} 筆 Firestore 更新，且不會刪除任何資料。確定執行？`);
    if (!confirmed) return;
    await runMigration(true);
}

async function runMigration(writeMode) {
    setBusy(true, writeMode ? '寫入中...' : '掃描中...');
    try {
        const plan = await buildMigrationPlan();
        latestPlan = plan;
        if (writeMode) {
            await commitPlan(plan);
            showToast('Migration 寫入完成。');
            latestPlan = await buildMigrationPlan();
            renderPlan(latestPlan, 'write');
        } else {
            renderPlan(plan, 'dry-run');
            showToast('Dry-run 掃描完成，尚未寫入資料。');
        }
    } catch (error) {
        console.error('[legacyMigration]', error);
        showToast('Migration 執行失敗，請查看 console。', 'error');
    } finally {
        setBusy(false);
    }
}

async function buildMigrationPlan() {
    const plan = {
        scannedTrips: 0,
        scannedSubcollectionDocs: 0,
        tripPatches: [],
        subcollectionPatches: [],
        unresolved: [],
    };

    const tripsSnapshot = await getDocs(collection(db, 'trips'));
    plan.scannedTrips = tripsSnapshot.size;

    for (const tripDoc of tripsSnapshot.docs) {
        const trip = tripDoc.data();
        const tripTitle = titleOf(trip);
        collectTripPatch(plan, tripDoc.id, trip, tripTitle);
        await collectSubcollectionPatches(plan, tripDoc.id, tripTitle);
    }

    return plan;
}

function collectTripPatch(plan, tripId, trip, tripTitle) {
    const hasOwnerId = Boolean(trip.ownerId);
    const hasMemberIds = Array.isArray(trip.memberIds) && trip.memberIds.length > 0;
    if (hasOwnerId && hasMemberIds) return;

    const resolved = resolveTripOwner(trip);
    if (!resolved) {
        plan.unresolved.push({
            type: 'trip',
            tripId,
            tripTitle,
            fields: availableTripFields(trip),
        });
        return;
    }

    const update = {};
    if (!hasOwnerId) update.ownerId = resolved.user.uid;
    if (!hasMemberIds) update.memberIds = [resolved.user.uid];

    plan.tripPatches.push({
        path: `trips/${tripId}`,
        update,
        tripId,
        tripTitle,
        matchedField: resolved.matchedField,
        matchedValue: resolved.matchedValue,
        user: publicUser(resolved.user),
    });
}

async function collectSubcollectionPatches(plan, tripId, tripTitle) {
    for (const subcollection of SUBCOLLECTIONS) {
        const snapshot = await getDocs(collection(db, 'trips', tripId, subcollection));
        plan.scannedSubcollectionDocs += snapshot.size;

        for (const subDoc of snapshot.docs) {
            const data = subDoc.data();
            const update = {};
            const unresolvedFields = {};

            if (!data.createdByUid) {
                const createdByUser = resolveUserByName(data.createdByName);
                if (createdByUser) {
                    update.createdByUid = createdByUser.uid;
                } else {
                    unresolvedFields.createdByName = data.createdByName || null;
                }
            }

            if (!data.updatedByUid && data.updatedByName) {
                const updatedByUser = resolveUserByName(data.updatedByName);
                if (updatedByUser) {
                    update.updatedByUid = updatedByUser.uid;
                } else {
                    unresolvedFields.updatedByName = data.updatedByName;
                }
            }

            if (Object.keys(update).length > 0) {
                plan.subcollectionPatches.push({
                    path: `trips/${tripId}/${subcollection}/${subDoc.id}`,
                    update,
                    tripId,
                    tripTitle,
                    collection: subcollection,
                    docId: subDoc.id,
                });
            }

            if (Object.keys(unresolvedFields).length > 0) {
                plan.unresolved.push({
                    type: 'subcollection',
                    tripId,
                    tripTitle,
                    collection: subcollection,
                    docId: subDoc.id,
                    fields: unresolvedFields,
                });
            }
        }
    }
}

async function commitPlan(plan) {
    const writes = [...plan.tripPatches, ...plan.subcollectionPatches];
    for (let index = 0; index < writes.length; index += BATCH_LIMIT) {
        const batch = writeBatch(db);
        for (const write of writes.slice(index, index + BATCH_LIMIT)) {
            batch.update(doc(db, write.path), write.update);
        }
        await batch.commit();
    }
}

function renderPlan(plan, mode) {
    counters.scannedTrips.textContent = String(plan.scannedTrips);
    counters.tripPatchCount.textContent = String(plan.tripPatches.length);
    counters.subPatchCount.textContent = String(plan.subcollectionPatches.length);
    counters.unresolvedCount.textContent = String(plan.unresolved.length);

    summaryOutput.textContent = JSON.stringify({
        mode,
        scannedTrips: plan.scannedTrips,
        scannedSubcollectionDocs: plan.scannedSubcollectionDocs,
        tripPatches: plan.tripPatches,
        subcollectionPatches: plan.subcollectionPatches,
        unresolvedCount: plan.unresolved.length,
    }, null, 2);

    unresolvedList.innerHTML = plan.unresolved.length
        ? plan.unresolved.map(renderUnresolvedItem).join('')
        : '<p style="color:var(--text-muted);">沒有 unresolved 項目。</p>';
}

function renderUnresolvedItem(item) {
    const title = item.type === 'trip'
        ? `Trip：${item.tripTitle} (${item.tripId})`
        : `子集合：${item.tripTitle} / ${item.collection} / ${item.docId}`;

    return `
        <article style="border:1px solid rgba(26,58,95,0.12); border-radius:12px; padding:14px; background:#fff;">
            <strong style="color:var(--primary);">${escapeHtml(title)}</strong>
            <pre style="white-space:pre-wrap; margin-top:8px; color:var(--text-muted);">${escapeHtml(JSON.stringify(item.fields, null, 2))}</pre>
        </article>
    `;
}

function setBusy(isBusy, label = '') {
    scanBtn.disabled = isBusy;
    writeBtn.disabled = isBusy;
    if (label) accessStatus.textContent = label;
    if (!isBusy && isAllowedUser(auth.currentUser)) {
        accessStatus.textContent = `已登入授權帳號：${auth.currentUser.email}。預設 dry-run，按「執行寫入」才會更新 Firestore。`;
    }
}

function normalizeName(value) {
    return String(value || '').trim();
}

function resolveUserByName(value) {
    const normalized = normalizeName(value);
    return normalized ? nameToUser.get(normalized) || null : null;
}

function resolveTripOwner(data) {
    for (const field of ['createdByName', 'ownerName', 'updatedByName']) {
        const user = resolveUserByName(data[field]);
        if (user) return { user, matchedField: field, matchedValue: data[field] };
    }
    return null;
}

function publicUser(user) {
    return {
        email: user.email,
        uid: user.uid,
        nickname: user.nickname,
    };
}

function titleOf(data) {
    return data.title || data.name || '(untitled)';
}

function availableTripFields(data) {
    return {
        createdByName: data.createdByName || null,
        ownerName: data.ownerName || null,
        updatedByName: data.updatedByName || null,
        ownerId: data.ownerId || null,
        memberIds: Array.isArray(data.memberIds) ? data.memberIds : null,
    };
}
