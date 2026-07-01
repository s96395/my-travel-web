#!/usr/bin/env node
/*
 * One-time Firestore migration for legacy trips and trip subcollection owner UID fields.
 *
 * Default mode is dry-run. Pass --write to persist updates:
 *   node scripts/migrate-legacy-owner-fields.js
 *   node scripts/migrate-legacy-owner-fields.js --write
 *
 * Requires firebase-admin credentials, for example via GOOGLE_APPLICATION_CREDENTIALS
 * or Application Default Credentials.
 */

const admin = require('firebase-admin');

const WRITE_MODE = process.argv.includes('--write');
const SUBCOLLECTIONS = ['itinerary', 'expenses', 'todos', 'images', 'diveLogs'];
const BATCH_LIMIT = 450;

const USERS = [
  {
    email: 's96395@gmail.com',
    nickname: 'Y SHEN',
    legacyNames: ['Y SHEN', 'YSHEN'],
    uid: 'Sy4sFjX88FSJMeutJKCRpgnt9SL2',
  },
  {
    email: 'yoyoshen@gis.fcu.edu.tw',
    nickname: '沈Yoyoshen',
    legacyNames: ['沈Yoyoshen'],
    uid: 'pG6F0S35GcYSpiHFfH88yDogLdq1',
  },
  {
    email: 'botakirisme@gmail.com',
    nickname: 'Iris',
    legacyNames: ['Iris'],
    uid: 'iTxvoRPKq1e4qjydsL0aBn5Ek062',
  },
];

const nameToUser = new Map();
for (const user of USERS) {
  for (const name of [user.nickname, ...user.legacyNames]) {
    nameToUser.set(normalizeName(name), user);
  }
}

admin.initializeApp();
const db = admin.firestore();

const stats = {
  scannedTrips: 0,
  patchedTrips: 0,
  skippedTrips: 0,
  unresolvedTrips: [],
  scannedSubcollectionDocs: 0,
  patchedSubcollectionDocs: 0,
  unresolvedSubcollectionDocs: [],
};

const pendingWrites = [];

function normalizeName(value) {
  return String(value || '').trim();
}

function resolveUserByName(value) {
  const normalized = normalizeName(value);
  return normalized ? nameToUser.get(normalized) || null : null;
}

function resolveTripOwner(data) {
  const fields = ['createdByName', 'ownerName', 'updatedByName'];
  for (const field of fields) {
    const user = resolveUserByName(data[field]);
    if (user) {
      return { user, matchedField: field, matchedValue: data[field] };
    }
  }
  return null;
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

function queueUpdate(ref, update) {
  if (Object.keys(update).length === 0) return;
  pendingWrites.push({ ref, update });
}

async function commitPendingWrites() {
  if (!WRITE_MODE || pendingWrites.length === 0) return;

  for (let index = 0; index < pendingWrites.length; index += BATCH_LIMIT) {
    const batch = db.batch();
    for (const write of pendingWrites.slice(index, index + BATCH_LIMIT)) {
      batch.update(write.ref, write.update);
    }
    await batch.commit();
  }
}

async function scanTripSubcollections(tripRef, tripId, tripTitle) {
  for (const subcollection of SUBCOLLECTIONS) {
    const snapshot = await tripRef.collection(subcollection).get();
    stats.scannedSubcollectionDocs += snapshot.size;

    for (const doc of snapshot.docs) {
      const data = doc.data();
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
        stats.patchedSubcollectionDocs += 1;
        queueUpdate(doc.ref, update);
        console.log(
          `[subcollection patch] trip=${tripId} title="${tripTitle}" collection=${subcollection} doc=${doc.id} fields=${Object.keys(update).join(',')}`,
        );
      }

      if (Object.keys(unresolvedFields).length > 0) {
        stats.unresolvedSubcollectionDocs.push({
          tripId,
          tripTitle,
          collection: subcollection,
          docId: doc.id,
          availableFields: unresolvedFields,
        });
      }
    }
  }
}

async function main() {
  console.log(`Mode: ${WRITE_MODE ? 'write mode' : 'dry-run'}`);

  const tripsSnapshot = await db.collection('trips').get();
  stats.scannedTrips = tripsSnapshot.size;

  for (const doc of tripsSnapshot.docs) {
    const data = doc.data();
    const tripTitle = titleOf(data);
    const hasOwnerId = Boolean(data.ownerId);
    const hasMemberIds = Array.isArray(data.memberIds) && data.memberIds.length > 0;

    if (hasOwnerId && hasMemberIds) {
      stats.skippedTrips += 1;
    } else {
      const resolved = resolveTripOwner(data);
      if (resolved) {
        const update = { ownerName: resolved.user.nickname };
        if (!hasOwnerId) update.ownerId = resolved.user.uid;
        if (!hasMemberIds) update.memberIds = [resolved.user.uid];

        stats.patchedTrips += 1;
        queueUpdate(doc.ref, update);
        console.log(
          `[trip patch] id=${doc.id} title="${tripTitle}" owner=${resolved.user.nickname} uid=${resolved.user.uid} matched=${resolved.matchedField}:"${resolved.matchedValue}" fields=${Object.keys(update).join(',')}`,
        );
      } else {
        stats.unresolvedTrips.push({
          tripId: doc.id,
          title: tripTitle,
          availableFields: availableTripFields(data),
        });
      }
    }

    await scanTripSubcollections(doc.ref, doc.id, tripTitle);
  }

  await commitPendingWrites();

  console.log('\nSummary');
  console.log(`Mode: ${WRITE_MODE ? 'write mode' : 'dry-run'}`);
  console.log(`Scanned trips: ${stats.scannedTrips}`);
  console.log(`Patched trips: ${stats.patchedTrips}`);
  console.log(`Skipped trips: ${stats.skippedTrips}`);
  console.log(`Unresolved trips: ${stats.unresolvedTrips.length}`);
  console.log(`Scanned subcollection documents: ${stats.scannedSubcollectionDocs}`);
  console.log(`Patched subcollection documents: ${stats.patchedSubcollectionDocs}`);
  console.log(`Unresolved subcollection documents: ${stats.unresolvedSubcollectionDocs.length}`);

  if (stats.unresolvedTrips.length > 0) {
    console.log('\nUnresolved trips detail');
    for (const item of stats.unresolvedTrips) {
      console.log(
        `[unresolved trip] id=${item.tripId} title="${item.title}" availableFields=${JSON.stringify(item.availableFields)}`,
      );
    }
  }

  if (stats.unresolvedSubcollectionDocs.length > 0) {
    console.log('\nUnresolved subcollection documents detail');
    for (const item of stats.unresolvedSubcollectionDocs) {
      console.log(
        `[unresolved subcollection] trip=${item.tripId} title="${item.tripTitle}" collection=${item.collection} doc=${item.docId} availableFields=${JSON.stringify(item.availableFields)}`,
      );
    }
  }

  if (!WRITE_MODE) {
    console.log('\nDry-run only: no Firestore writes were made. Re-run with --write to apply updates.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
