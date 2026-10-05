import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTelegram1791183327568 implements MigrationInterface {
    name = 'AddTelegram1791183327568'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "telegram_link_token" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "tokenHash" character(64) NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "usedAt" TIMESTAMP WITH TIME ZONE, "invalidatedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_2b5519bfb37b65a9a8d2725729b" UNIQUE ("tokenHash"), CONSTRAINT "PK_dd35d36ee218c1e02318087fa24" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_f1b488ee3bfe99a6c20e966b7f" ON "telegram_link_token"  ("userId") `);
        await queryRunner.query(`CREATE TABLE "telegram_link" ("userId" uuid NOT NULL, "chatId" bigint NOT NULL, "linkedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "optedOutAt" TIMESTAMP WITH TIME ZONE, "unreachableAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_f0024c6d71d60562547a4cb1f66" UNIQUE ("chatId"), CONSTRAINT "PK_2135e0ff717f8ef28efbc7aec80" PRIMARY KEY ("userId"))`);
        await queryRunner.query(`CREATE TABLE "telegram_message" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "direction" character varying(16) NOT NULL, "contentType" character varying(32) NOT NULL, "text" text, "status" character varying(16) NOT NULL, "failureReason" character varying(255), "telegramMessageId" bigint, "occurredAt" TIMESTAMP WITH TIME ZONE NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_0f48df9231add0c422fad2cd809" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_d825c52410af9639a9dd11045f" ON "telegram_message"  ("userId", "occurredAt", "createdAt") `);
        await queryRunner.query(`CREATE TABLE "telegram_update" ("updateId" bigint NOT NULL, "receivedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_6dc6a1f7b3ad7b2ad376a24b3af" PRIMARY KEY ("updateId"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "telegram_update"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d825c52410af9639a9dd11045f"`);
        await queryRunner.query(`DROP TABLE "telegram_message"`);
        await queryRunner.query(`DROP TABLE "telegram_link"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f1b488ee3bfe99a6c20e966b7f"`);
        await queryRunner.query(`DROP TABLE "telegram_link_token"`);
    }

}
