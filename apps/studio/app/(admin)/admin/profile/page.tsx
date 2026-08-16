import { ErrorBanner } from "@/components/admin/error-banner";
import { currentUser } from "@/lib/admin/api";
import { AVATAR_EMOJIS } from "@/lib/admin/avatar-emojis";
import { getT } from "@/i18n/server";

import { ProfileSettings } from "./profile-settings";

// SelectTrigger is rendered by the route-local client component after this page reads /api/auth/me.
export default async function ProfilePage() {
  const t = await getT("nav");
  const me = await currentUser();
  const user = me.ok && me.data.type === "human" ? me.data : null;

  if (!user) {
    return (
      <div className="max-w-3xl">
        <ErrorBanner message={t("profile_load_error")} />
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <ProfileSettings
        avatarEmoji={user.avatarEmoji ?? AVATAR_EMOJIS[0]}
        firstName={user.firstName}
        lastName={user.lastName}
      />
    </div>
  );
}
