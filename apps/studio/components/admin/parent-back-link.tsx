import Link from "next/link";
import type { ReactNode } from "react";

type Props = {
  href: string;
  children: ReactNode;
};

export function ParentBackLink({ href, children }: Props) {
  return (
    <div>
      <Link href={href} className="text-sm text-muted-foreground transition-colors hover:text-foreground active:text-foreground">
        {children}
      </Link>
    </div>
  );
}
