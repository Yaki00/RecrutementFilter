const crypto = require("crypto");

const TOKEN_TTL_MS = 4 * 60 * 60 * 1000;

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodePayload(encoded) {
  return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
}

function signPayload(encodedPayload, secret) {
  return crypto.createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function createCandidateToken(candidateId, secret, ttlMs = TOKEN_TTL_MS) {
  const payload = {
    candidateId,
    exp: Date.now() + ttlMs
  };
  const encodedPayload = encodePayload(payload);
  const signature = signPayload(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

function verifyCandidateToken(token, candidateId, secret, now = Date.now()) {
  if (!token || !candidateId || !secret) return false;

  const [encodedPayload, signature] = String(token).split(".");
  if (!encodedPayload || !signature) return false;

  const expectedSignature = signPayload(encodedPayload, secret);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedBuffer.length) return false;

  const signaturesMatch = crypto.timingSafeEqual(signatureBuffer, expectedBuffer);

  if (!signaturesMatch) return false;

  try {
    const payload = decodePayload(encodedPayload);
    if (payload.candidateId !== candidateId) return false;
    if (!payload.exp || payload.exp <= now) return false;
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  TOKEN_TTL_MS,
  createCandidateToken,
  verifyCandidateToken
};
