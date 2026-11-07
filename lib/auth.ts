import "server-only"
import { db } from "./db/client"
import { usersTable } from "./db/schema"

export const requireUser = async () => {
  const user = await db.select().from(usersTable).limit(1).execute()
  console.log(user[0])
  return user[0]
  return {
    id: "3513f009-7201-47f2-bbb6-9777e85aa055",
    name: "Bruno",
  }
}
