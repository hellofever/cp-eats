import { redirect } from "next/navigation";

// See app/list/page.tsx -- same redirect shim, for old /sheet bookmarks/links.
export default async function SheetRedirect({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") params.set(key, value);
  }
  params.set("view", "sheet");
  redirect(`/?${params.toString()}`);
}
