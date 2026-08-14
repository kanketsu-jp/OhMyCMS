import Link from "next/link";

import { NewFolderForm } from "@/components/admin/new-folder-form";
import { Surface } from "@/components/ui/surface";
import { getT } from "@/i18n/server";

type Props = {
  searchParams: Promise<{ parent?: string }>;
};

export default async function NewFolderPage({ searchParams }: Props) {
  const tFiles = await getT("files");
  const query = await searchParams;
  const parent = query.parent && query.parent !== "root" ? query.parent : null;
  const backHref = parent ? `/admin/files?folder=${parent}` : "/admin/files";

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <Link href={backHref} className="text-sm text-muted-foreground hover:text-foreground">
          {tFiles("back_to_list")}
        </Link>
      </div>
      <Surface>
        <NewFolderForm parent={parent} />
      </Surface>
    </div>
  );
}
