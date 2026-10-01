const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";

function getEncryptionKey() {
  const secret = process.env.WALLET_ENCRYPTION_KEY;

  if (!secret) {
    throw new Error("WALLET_ENCRYPTION_KEY is not configured");
  }

  if (!/^[0-9a-fA-F]{64}$/.test(secret)) {
    throw new Error("WALLET_ENCRYPTION_KEY must be a 64-character hex secret");
  }

  return Buffer.from(secret, "hex");
}

function generateWallet() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519", {
    publicKeyEncoding: {
      type: "spki",
      format: "der"
    },
    privateKeyEncoding: {
      type: "pkcs8",
      format: "der"
    }
  });

  const publicKeyBase64 = publicKey.toString("base64url");

  const addressHash = crypto
    .createHash("sha256")
    .update(publicKey)
    .digest("hex")
    .toUpperCase();

  const publicAddress = `LOVE${addressHash.slice(0, 40)}`;

  return {
    publicKey: publicKeyBase64,
    publicAddress,
    privateKey: privateKey.toString("base64")
  };
}

/*
|--------------------------------------------------------------------------
| DERIVE WALLET FROM PRIVATE KEY
|--------------------------------------------------------------------------
| Converts the user's PKCS8 Ed25519 private key into the
| corresponding public key and LOVE address.
*/
function deriveWalletFromPrivateKey(privateKeyBase64) {
  if (
    typeof privateKeyBase64 !== "string" ||
    !privateKeyBase64.trim()
  ) {
    throw new Error("Private key is required");
  }

  const normalizedPrivateKey = privateKeyBase64.trim();

  let privateKeyDer;

  try {
    privateKeyDer = Buffer.from(
      normalizedPrivateKey,
      "base64"
    );
  } catch {
    throw new Error("Invalid private key");
  }

  if (!privateKeyDer.length) {
    throw new Error("Invalid private key");
  }

  let privateKeyObject;

  try {
    privateKeyObject = crypto.createPrivateKey({
      key: privateKeyDer,
      format: "der",
      type: "pkcs8"
    });
  } catch {
    throw new Error("Invalid private key");
  }

  if (privateKeyObject.asymmetricKeyType !== "ed25519") {
    throw new Error("Invalid wallet private key");
  }

  const publicKey = crypto.createPublicKey(
    privateKeyObject
  ).export({
    type: "spki",
    format: "der"
  });

  const publicKeyBase64 = publicKey.toString("base64url");

  const addressHash = crypto
    .createHash("sha256")
    .update(publicKey)
    .digest("hex")
    .toUpperCase();

  const publicAddress =
    `LOVE${addressHash.slice(0, 40)}`;

  return {
    publicKey: publicKeyBase64,
    publicAddress
  };
}

function encryptPrivateKey(privateKeyBase64) {
  const key = getEncryptionKey();

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(
      Buffer.from(privateKeyBase64, "base64")
    ),
    cipher.final()
  ]);

  const authTag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64")
  ].join(".");
}

function decryptPrivateKey(encryptedValue) {
  const key = getEncryptionKey();

  const parts = String(encryptedValue).split(".");

  if (parts.length !== 3) {
    throw new Error("Invalid encrypted private key");
  }

  const iv = Buffer.from(parts[0], "base64");
  const authTag = Buffer.from(parts[1], "base64");
  const encrypted = Buffer.from(parts[2], "base64");

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    iv
  );

  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]);

  return decrypted.toString("base64");
}

module.exports = {
  generateWallet,
  deriveWalletFromPrivateKey,
  encryptPrivateKey,
  decryptPrivateKey
};
