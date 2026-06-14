// Thin wrappers over @simplewebauthn/server v13 wired to the Hub store. Handles
// the COSE publicKey <-> base64url conversion and pulls users/credentials/
// challenges from hub/store. Config comes from env with safe local defaults.

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  AuthenticatorTransportFuture,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import {
  getUser,
  getCredentialsByUser,
  getCredentialById,
  addCredential,
  updateCredentialCounter,
  setChallenge,
  getChallenge,
  clearChallenge,
} from "@/lib/hub/store";
import type { StoredCredential, User } from "@/lib/hub/model";

export const rpID = process.env.HX_RP_ID || "localhost";
export const rpName = "Hx";
export const origin = process.env.HX_ORIGIN || "http://localhost:3000";
// expectedOrigin is a single string (per spec env).
export const expectedOrigin = origin;

// ---- helpers -------------------------------------------------------------

function credToDescriptors(creds: StoredCredential[]) {
  return creds.map((c) => ({
    id: c.id, // already base64url
    transports: c.transports as AuthenticatorTransportFuture[] | undefined,
  }));
}

// ---- Registration --------------------------------------------------------

export async function buildRegistrationOptions(
  user: User,
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const existing = getCredentialsByUser(user.id);
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.username,
    userDisplayName: user.displayName,
    // user.id is a short opaque string; encode to bytes for the authenticator.
    userID: isoBase64URL.toBuffer(isoBase64URL.fromUTF8String(user.id)),
    attestationType: "none",
    excludeCredentials: credToDescriptors(existing),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });
  // Persist the challenge keyed by username so verify can look it up.
  setChallenge(user.username, options.challenge);
  return options;
}

export type RegistrationResult =
  | { ok: true; credential: StoredCredential }
  | { ok: false; error: string };

export async function verifyAndStoreRegistration(
  user: User,
  response: RegistrationResponseJSON,
): Promise<RegistrationResult> {
  const expectedChallenge = getChallenge(user.username);
  if (!expectedChallenge) return { ok: false, error: "no pending challenge" };

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "verification failed" };
  }

  if (!verification.verified || !verification.registrationInfo) {
    return { ok: false, error: "registration not verified" };
  }

  const { credential } = verification.registrationInfo;
  const stored: StoredCredential = {
    id: credential.id, // base64url credential ID
    userId: user.id,
    publicKey: isoBase64URL.fromBuffer(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports as string[] | undefined,
    createdAt: new Date().toISOString(),
  };
  addCredential(stored);
  clearChallenge(user.username);
  return { ok: true, credential: stored };
}

// ---- Authentication ------------------------------------------------------

export async function buildAuthenticationOptions(
  user: User,
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const creds = getCredentialsByUser(user.id);
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: credToDescriptors(creds),
    userVerification: "preferred",
  });
  setChallenge(user.username, options.challenge);
  return options;
}

export type AuthenticationResult =
  | { ok: true; user: User }
  | { ok: false; error: string };

export async function verifyAuthentication(
  user: User,
  response: AuthenticationResponseJSON,
): Promise<AuthenticationResult> {
  const expectedChallenge = getChallenge(user.username);
  if (!expectedChallenge) return { ok: false, error: "no pending challenge" };

  const stored = getCredentialById(response.id);
  if (!stored || stored.userId !== user.id) {
    return { ok: false, error: "credential not found for user" };
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin,
      expectedRPID: rpID,
      requireUserVerification: false,
      credential: {
        id: stored.id,
        publicKey: isoBase64URL.toBuffer(stored.publicKey),
        counter: stored.counter,
        transports: stored.transports as AuthenticatorTransportFuture[] | undefined,
      },
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "verification failed" };
  }

  if (!verification.verified) {
    return { ok: false, error: "authentication not verified" };
  }

  updateCredentialCounter(stored.id, verification.authenticationInfo.newCounter);
  clearChallenge(user.username);

  const fresh = getUser(user.id) ?? user;
  return { ok: true, user: fresh };
}
