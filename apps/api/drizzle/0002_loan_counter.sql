ALTER TABLE "books" ADD COLUMN "on_loan" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_on_loan_within_copies" CHECK ("books"."on_loan" >= 0 and "books"."on_loan" <= "books"."copies");
   --> statement-breakpoint
   UPDATE "books" SET "on_loan" = (SELECT count(*) FROM "loans" l WHERE l."book_id" = "books"."id" AND l."returned_at" IS NULL);