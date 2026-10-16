ALTER TABLE "invites" ADD COLUMN "max_uses" integer;--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "use_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "ended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "invite_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_invite_id_invites_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."invites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Invites from before SYS-21 were for one person each: keep who used them.
UPDATE "invites" SET "max_uses" = 1, "use_count" = CASE WHEN "used_at" IS NULL THEN 0 ELSE 1 END;--> statement-breakpoint
UPDATE "users" SET "invite_id" = "invites"."id" FROM "invites" WHERE "invites"."used_by" = "users"."id";--> statement-breakpoint
ALTER TABLE "invites" DROP CONSTRAINT "invites_used_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "invites" DROP COLUMN "used_by";--> statement-breakpoint
ALTER TABLE "invites" DROP COLUMN "used_at";