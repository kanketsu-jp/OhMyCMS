import {
  deriveBase64,
  deriveBase64Url,
  deriveHex,
  seedIsPresent,
} from "../lib/config/derive";

if (!seedIsPresent()) {
  console.log("OHMYCMS_SEED が未設定です");
  process.exitCode = 1;
} else {
  console.log(`db-password        ${deriveHex("db-password")}`);
  console.log(`secret-key         ${deriveBase64("secret-key")}`);
  console.log(`setup-password     ${deriveBase64Url("setup-password", 20)}`);
  console.log(`trash-purge-token  ${deriveBase64Url("trash-purge-token")}`);
}
