const REQUIRED_FIREBASE_CONFIG_FIELDS = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
];

function getRuntimeFirebaseConfig() {
  const rawConfig = process.env.FIREBASE_CONFIG_JSON;
  if (!rawConfig) {
    throw new Error('FIREBASE_CONFIG_JSON is not configured.');
  }

  let config;
  try {
    config = JSON.parse(rawConfig);
  } catch {
    throw new Error('FIREBASE_CONFIG_JSON is not valid JSON.');
  }

  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('FIREBASE_CONFIG_JSON must contain a JSON object.');
  }

  const missingFields = REQUIRED_FIREBASE_CONFIG_FIELDS.filter(field => (
    typeof config[field] !== 'string' || !config[field].trim()
  ));
  if (missingFields.length) {
    throw new Error(`FIREBASE_CONFIG_JSON is missing required fields: ${missingFields.join(', ')}`);
  }

  return {
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    storageBucket: config.storageBucket,
    messagingSenderId: config.messagingSenderId,
    appId: config.appId,
    ...(typeof config.measurementId === 'string' && config.measurementId.trim()
      ? { measurementId: config.measurementId }
      : {}),
  };
}

module.exports = function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store, max-age=0');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    return response.status(200).json(getRuntimeFirebaseConfig());
  } catch (error) {
    console.error('[firebaseConfigEndpoint]', error.message);
    return response.status(500).json({ error: 'Firebase runtime configuration is unavailable.' });
  }
};
