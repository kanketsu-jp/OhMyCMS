import Link from "next/link";
import { FieldCreateForm } from "@/components/admin/field-create-form";
import { Surface } from "@/components/ui/surface";
import { getT } from "@/i18n/server";

type Props = {
  params: Promise<{ collection: string }>;
};

export default async function NewFieldPage({ params }: Props) {
  const { collection } = await params;
  const encoded = encodeURIComponent(collection);
  const tFields = await getT("fields");

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href={`/admin/collections/${encoded}`} className="text-sm text-muted-foreground hover:text-foreground">
          {tFields("back_to_collection")}
        </Link>
      </div>
      <Surface>
        <FieldCreateForm collection={encoded} />
      </Surface>
    </div>
  );
}
