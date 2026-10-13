CREATE TABLE "records" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"revision" bigint NOT NULL,
	"ciphertext" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "records_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "record_revision" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "records_user_id_revision_idx" ON "records" USING btree ("user_id","revision");