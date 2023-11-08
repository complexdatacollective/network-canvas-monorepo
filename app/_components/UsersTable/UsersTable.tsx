import { DataTable } from "@/components/DataTable/data-table";
import { columns } from "./Columns";

export default async function ErrorsTable() {
  const users = [
    {
      fullName: "John Doe",
      username: "johndoe",
      imageUrl: "https://example.com/image.png",
      unsafeMetadata: {
        verified: true,
      },
    },
    {
      fullName: "Jane Doe",
      username: "janedoe",
      imageUrl: "https://example.com/image.png",
      unsafeMetadata: {
        verified: false,
      },
    },
  ];
  return <DataTable columns={columns} data={users} />;
}
