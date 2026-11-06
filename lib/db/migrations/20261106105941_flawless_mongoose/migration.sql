CREATE TABLE "messages" (
	"attachments" json NOT NULL,
	"chatId" uuid NOT NULL,
	"createdAt" timestamp NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"parts" json NOT NULL,
	"role" varchar NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_chatId_chats_id_fkey" FOREIGN KEY ("chatId") REFERENCES "chats"("id");