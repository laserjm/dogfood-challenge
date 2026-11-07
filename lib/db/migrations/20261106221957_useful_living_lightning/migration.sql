ALTER TABLE "messages" ADD COLUMN "position" integer;
--> statement-breakpoint
WITH ranked_messages AS (
	SELECT "id", (row_number() OVER (
		PARTITION BY "chatId" ORDER BY "createdAt", "id"
	) - 1)::integer AS "position"
	FROM "messages"
)
UPDATE "messages"
SET "position" = ranked_messages."position"
FROM ranked_messages
WHERE "messages"."id" = ranked_messages."id";
--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "position" SET NOT NULL;
