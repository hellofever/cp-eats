import { redirect } from "next/navigation";

// Map/List/Sheet used to be three separate routes; they're one now, switched with
// ?view= (see app/page.tsx and Header's tabHref) so tab switches don't unmount/remount
// state. This keeps old /list bookmarks and shared links working by forwarding them,
// with whatever query params they had, to the equivalent /?view=list URL.
export default async function ListRedirect({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") params.set(key, value);
  }
  params.set("view", "list");
  redirect(`/?${params.toString()}`);
}
