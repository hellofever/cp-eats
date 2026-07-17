import { TagManagerSection } from "./TagManagerSection";

// Order matches RestaurantForm's field order (Type, Tags, Area) for familiarity.
export function TagManager() {
  return (
    <div className="flex flex-col gap-5">
      <TagManagerSection kind="type" label="Type" colorable />
      <TagManagerSection kind="tags" label="Tags" />
      <TagManagerSection kind="area" label="Area" />
    </div>
  );
}
