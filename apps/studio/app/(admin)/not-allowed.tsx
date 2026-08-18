import { Button } from "@/components/ui/button";
import { getT } from "@/i18n/server";

type NotAllowedScreenProps = {
  brand: string;
  logo: string | null;
};

export async function NotAllowedScreen({ brand, logo }: NotAllowedScreenProps) {
  const t = await getT("auth");

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-10">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
        <div className="flex flex-col items-center gap-3">
          <div className="flex max-w-full items-center justify-center gap-2">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- external logo URLs can be configured
              <img src={logo} alt="" className="h-6 w-auto max-w-32 object-contain" />
            ) : null}
            <p className="truncate text-sm font-medium text-muted-foreground">{brand}</p>
          </div>
          <h1 className="text-2xl font-semibold tracking-normal">
            {t("not_allowed_title")}
          </h1>
          <p className="text-base leading-6 text-muted-foreground">
            {t("not_allowed_message")}
          </p>
        </div>
        <form action="/admin/actions/logout" method="post" className="w-full">
          <Button type="submit" size="entry" className="w-full">
            {t("not_allowed_logout")}
          </Button>
        </form>
      </div>
    </main>
  );
}
