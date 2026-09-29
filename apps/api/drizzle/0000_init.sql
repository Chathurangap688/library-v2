CREATE TYPE "public"."reading_state" AS ENUM('to_read', 'reading', 'read');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('pending', 'active');--> statement-breakpoint
CREATE TABLE "book_categories" (
	"book_id" uuid NOT NULL,
	"category_id" integer NOT NULL,
	CONSTRAINT "book_categories_book_id_category_id_pk" PRIMARY KEY("book_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"title_singlish" text,
	"author" text,
	"author_singlish" text,
	"language" text,
	"is_translation" boolean DEFAULT false NOT NULL,
	"translator" text,
	"original_title" text,
	"original_author" text,
	"isbn" text,
	"publisher" text,
	"year" integer,
	"description" text,
	"review_summary" text,
	"web_sources" jsonb,
	"cover_url" text,
	"copies" integer DEFAULT 1 NOT NULL,
	"shelf" text,
	"purchased_from" text,
	"purchase_date" date,
	"price" numeric(10, 2),
	"notes" text,
	"added_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "books_copies_positive" CHECK ("books"."copies" >= 1)
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "loans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"book_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"borrowed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"returned_at" timestamp with time zone,
	"lent_by" uuid,
	"returned_by" uuid
);
--> statement-breakpoint
CREATE TABLE "ratings" (
	"user_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	"rating" smallint NOT NULL,
	"review" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ratings_user_id_book_id_pk" PRIMARY KEY("user_id","book_id"),
	CONSTRAINT "ratings_1_to_5" CHECK ("ratings"."rating" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "reading_status" (
	"user_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	"status" "reading_state" DEFAULT 'to_read' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reading_status_user_id_book_id_pk" PRIMARY KEY("user_id","book_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"sub" text,
	"name" text,
	"picture" text,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"status" "user_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "book_categories" ADD CONSTRAINT "book_categories_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_categories" ADD CONSTRAINT "book_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_lent_by_users_id_fk" FOREIGN KEY ("lent_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_returned_by_users_id_fk" FOREIGN KEY ("returned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_status" ADD CONSTRAINT "reading_status_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_status" ADD CONSTRAINT "reading_status_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "books_isbn_uq" ON "books" USING btree ("isbn") WHERE "books"."isbn" is not null and "books"."isbn" <> '';--> statement-breakpoint
CREATE INDEX "books_search_idx" ON "books" USING gin (to_tsvector('simple',
    coalesce("title", '') || ' ' || coalesce("title_singlish", '') || ' ' ||
    coalesce("author", '') || ' ' || coalesce("author_singlish", '') || ' ' ||
    coalesce("translator", '') || ' ' || coalesce("original_title", '')));--> statement-breakpoint
CREATE INDEX "loans_open_idx" ON "loans" USING btree ("book_id") WHERE "loans"."returned_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "users_sub_uq" ON "users" USING btree ("sub");