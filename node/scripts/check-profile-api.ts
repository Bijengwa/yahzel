import { db } from "../src/db/knex.js";

const API = "http://localhost:5000";
let failures = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  if (!condition) failures += 1;
  console.log(
    `${condition ? "PASS" : "FAIL"}  ${label}${
      condition ? "" : `  -> ${JSON.stringify(detail)}`
    }`,
  );
}

async function call(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, options);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body: body as any };
}

function json(
  method: string,
  token: string | null,
  payload?: unknown,
): RequestInit {
  return {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  };
}

async function makeUser(fullName: string, email: string) {
  const reg = await call(
    "/api/auth/register",
    json("POST", null, {
      fullName,
      email,
      password: "password123",
      confirmPassword: "password123",
    }),
  );
  const id = reg.body.user.id as number;
  const row = await db("profiles").where({ id }).first();
  const verified = await call(
    "/api/auth/verify",
    json("POST", null, { userId: id, otp: row.verification_otp }),
  );
  return {
    id,
    token: verified.body.token as string,
    username: reg.body.user.username as string,
  };
}

const stamp = Date.now();

// Stamp-derived, not a fixed literal: a hardcoded test number can collide
// with a real developer's own dev-database account using the same number,
// which is exactly what made this script crash on an unrelated, pre-existing
// local dev row rather than exercising the phone-number logic being tested.
const testPhoneSuffix = String(stamp).slice(-9);
const testPhone = `+255${testPhoneSuffix}`;
const wrongCountryPhone = `+254${testPhoneSuffix}`;

const a = await makeUser("Amina Test", `amina${stamp}@example.com`);
const b = await makeUser("Baraka Test", `baraka${stamp}@example.com`);

check(
  "registration assigns a username",
  /^[a-z][a-z0-9_]{2,29}$/.test(a.username),
  a.username,
);
check("two accounts get different usernames", a.username !== b.username, [
  a.username,
  b.username,
]);

// --- read
let r = await call("/api/profile", json("GET", a.token));
check(
  "GET /api/profile returns the signed-in profile",
  r.status === 200 && r.body.profile.id === a.id,
  r.body,
);
check(
  "no password hash leaks",
  !JSON.stringify(r.body).includes("password"),
  Object.keys(r.body.profile),
);
check(
  "no one-time codes leak",
  !JSON.stringify(r.body).includes("_otp"),
  Object.keys(r.body.profile),
);
check(
  "completion starts at 50 percent",
  r.body.profile.completion.percent === 50,
  r.body.profile.completion,
);

// --- ownership: a token cannot name somebody else
r = await call(
  "/api/profile",
  json("PATCH", a.token, {
    id: b.id,
    userId: b.id,
    fullName: "Amina Updated",
  }),
);
const bAfter = await db("profiles").where({ id: b.id }).first();
check(
  "a token cannot patch a different row",
  bAfter.full_name === "Baraka Test",
  bAfter.full_name,
);
check(
  "supplied ids are ignored and the own row updates",
  r.body.profile.fullName === "Amina Updated",
  r.body.profile.fullName,
);

// --- country then phone
r = await call(
  "/api/profile",
  json("PATCH", a.token, { country: "TZ", gender: "female" }),
);
check(
  "country and gender saved, dial code derived",
  r.body.profile.country === "TZ" && r.body.profile.dialCode === "+255",
  r.body.profile,
);

r = await call(
  "/api/profile",
  json("PATCH", a.token, { phoneNumber: wrongCountryPhone }),
);
check(
  "phone from a different country is rejected",
  r.status === 422 && r.body.errors[0].field === "phoneNumber",
  r.body,
);

r = await call(
  "/api/profile",
  json("PATCH", a.token, { phoneNumber: testPhone }),
);
check(
  "matching phone saved as unverified",
  r.body.profile.phoneNumber === testPhone &&
    r.body.profile.phoneVerified === false,
  r.body.profile,
);

// --- uniqueness
r = await call("/api/profile", json("PATCH", b.token, { username: a.username }));
check(
  "duplicate username rejected with a field error",
  r.status === 422 && r.body.errors[0].field === "username",
  r.body,
);

r = await call(
  "/api/profile",
  json("PATCH", b.token, { country: "TZ", phoneNumber: testPhone }),
);
check(
  "duplicate phone rejected with a field error",
  r.status === 422 && r.body.errors[0].field === "phoneNumber",
  r.body,
);

r = await call(
  "/api/profile/email/change",
  json("POST", b.token, { email: `amina${stamp}@example.com` }),
);
check(
  "duplicate email rejected",
  r.status === 409 && r.body.errors[0].field === "email",
  r.body,
);

r = await call("/api/profile", json("PATCH", a.token, { username: "YAHZEL" }));
check("reserved username rejected", r.status === 422, r.body);

r = await call("/api/profile", json("PATCH", a.token, { username: "a b!" }));
check("malformed username rejected", r.status === 422, r.body);

// --- phone verification
r = await call("/api/profile/phone/send-code", json("POST", a.token));
const phoneOtp = r.body.devOtp as string;
check(
  "phone code exposed for development",
  /^\d{6}$/.test(phoneOtp ?? ""),
  r.body,
);

r = await call(
  "/api/profile/phone/verify",
  json("POST", a.token, { otp: "000000" }),
);
check("wrong phone code rejected", r.status === 400, r.body);

r = await call(
  "/api/profile/phone/verify",
  json("POST", a.token, { otp: phoneOtp }),
);
check(
  "correct phone code verifies",
  r.body.profile.phoneVerified === true,
  r.body,
);

// --- email change keeps the old address trusted until confirmation
const newEmail = `amina.new${stamp}@example.com`;
r = await call(
  "/api/profile/email/change",
  json("POST", a.token, { email: newEmail }),
);
const emailOtp = r.body.devOtp as string;
check(
  "email change stores a pending address",
  r.body.profile.pendingEmail === newEmail,
  r.body.profile,
);
check(
  "current email unchanged while a change is pending",
  r.body.profile.email === `amina${stamp}@example.com`,
  r.body.profile.email,
);
check(
  "current email still verified while pending",
  r.body.profile.emailVerified === true,
  r.body.profile,
);

const stillOld = await db("profiles").where({ id: a.id }).first();
check(
  "database keeps the old email until confirmed",
  stillOld.email === `amina${stamp}@example.com`,
  stillOld.email,
);

r = await call(
  "/api/profile/email/verify",
  json("POST", a.token, { otp: "111111" }),
);
check("wrong email code rejected", r.status === 400, r.body);

r = await call(
  "/api/profile/email/verify",
  json("POST", a.token, { otp: emailOtp }),
);
check(
  "correct code swaps the email in as verified",
  r.body.profile.email === newEmail && r.body.profile.emailVerified === true,
  r.body.profile,
);
check(
  "pending address cleared",
  r.body.profile.pendingEmail === null,
  r.body.profile,
);
check(
  "profile now 100 percent complete",
  r.body.profile.completion.percent === 100,
  r.body.profile.completion,
);

// --- the new address is the login identity
r = await call(
  "/api/auth/login",
  json("POST", null, { email: newEmail, password: "password123" }),
);
check(
  "the new email signs in",
  r.status === 200 && Boolean(r.body.token),
  r.body,
);

// --- cancel path
await call(
  "/api/profile/email/change",
  json("POST", a.token, { email: `temp${stamp}@example.com` }),
);
r = await call("/api/profile/email/cancel", json("POST", a.token));
check(
  "email change can be cancelled",
  r.body.profile.pendingEmail === null,
  r.body.profile,
);

// --- password
r = await call(
  "/api/auth/password",
  json("POST", a.token, {
    currentPassword: "wrongpass",
    newPassword: "newpassword1",
    confirmPassword: "newpassword1",
  }),
);
check("wrong current password rejected", r.status === 401, r.body);

r = await call(
  "/api/auth/password",
  json("POST", a.token, {
    currentPassword: "password123",
    newPassword: "newpassword1",
    confirmPassword: "different",
  }),
);
check("mismatched confirmation rejected", r.status === 400, r.body);

r = await call(
  "/api/auth/password",
  json("POST", a.token, {
    currentPassword: "password123",
    newPassword: "newpassword1",
    confirmPassword: "newpassword1",
  }),
);
check("password changed", r.status === 200, r.body);

r = await call(
  "/api/auth/login",
  json("POST", null, { email: newEmail, password: "newpassword1" }),
);
check(
  "new password signs in",
  r.status === 200 && Boolean(r.body.token),
  r.body,
);

// --- persistence across a fresh session
const fresh = r.body.token as string;
r = await call("/api/profile", json("GET", fresh));
check(
  "profile persists across sessions",
  r.body.profile.country === "TZ" &&
    r.body.profile.gender === "female" &&
    r.body.profile.phoneVerified === true,
  r.body.profile,
);

// --- picture
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
let res = await fetch(`${API}/api/profile/picture`, {
  method: "POST",
  headers: { "Content-Type": "image/png", Authorization: `Bearer ${fresh}` },
  body: png,
});
const pic = (await res.json()) as any;
check(
  "picture upload returns a path",
  typeof pic.profile?.profilePictureUrl === "string" &&
    pic.profile.profilePictureUrl.startsWith("/uploads/avatars/"),
  pic,
);

const served = await fetch(`${API}${pic.profile.profilePictureUrl}`);
check("uploaded picture is served back", served.status === 200, served.status);

const dbRow = await db("profiles").where({ id: a.id }).first();
check(
  "database stores only the path",
  dbRow.profile_picture_url.length < 120,
  dbRow.profile_picture_url?.length,
);

res = await fetch(`${API}/api/profile/picture`, {
  method: "POST",
  headers: { "Content-Type": "text/plain", Authorization: `Bearer ${fresh}` },
  body: "not an image",
});
check("non-image upload rejected", res.status === 415, res.status);

r = await call("/api/profile/picture", json("DELETE", fresh));
check(
  "picture removed",
  r.body.profile.profilePictureUrl === null,
  r.body.profile,
);

await db("profiles").whereIn("id", [a.id, b.id]).delete();

console.log(
  failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`,
);
await db.destroy();
process.exit(failures === 0 ? 0 : 1);
