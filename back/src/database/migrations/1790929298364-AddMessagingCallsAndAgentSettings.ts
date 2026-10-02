import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMessagingCallsAndAgentSettings1790929298364 implements MigrationInterface {
    name = 'AddMessagingCallsAndAgentSettings1790929298364'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "agent_settings" ("id" character varying(32) NOT NULL, "systemPrompt" text NOT NULL, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_ffe5afe48bdfd4f8fb00ef1e7e5" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "call" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "phoneNumber" character varying(20) NOT NULL, "status" character varying(16) NOT NULL, "endReason" character varying(32), "failureReason" text, "systemPrompt" text NOT NULL, "transcript" jsonb NOT NULL DEFAULT '[]', "roomName" character varying(64), "startedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "endedAt" TIMESTAMP WITH TIME ZONE, "durationSeconds" integer, CONSTRAINT "PK_2098af0169792a34f9cfdd39c47" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_b4b37dbf8d7e15b3dd90feb8b7" ON "call"  ("userId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_call_user_in_progress" ON "call"  ("userId") WHERE "status" = 'in_progress'`);
        await queryRunner.query(`CREATE TABLE "sms_message" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "phoneNumber" character varying(20) NOT NULL, "body" text NOT NULL, "status" character varying(16) NOT NULL, "failureReason" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_121900f2127a5152cf20898a11c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_ac33c4ce55a24ec18a16d712c0" ON "sms_message"  ("userId") `);
        await queryRunner.query(`CREATE TABLE "whats_app_message" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "phoneNumber" character varying(20) NOT NULL, "content" text NOT NULL, "deliveryMode" character varying(16) NOT NULL, "status" character varying(16) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_35fcd9935d7d77dcf686b6290a0" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_1d146883d0d58cbbcc9b2bfb3d" ON "whats_app_message"  ("userId") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_1d146883d0d58cbbcc9b2bfb3d"`);
        await queryRunner.query(`DROP TABLE "whats_app_message"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ac33c4ce55a24ec18a16d712c0"`);
        await queryRunner.query(`DROP TABLE "sms_message"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_call_user_in_progress"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b4b37dbf8d7e15b3dd90feb8b7"`);
        await queryRunner.query(`DROP TABLE "call"`);
        await queryRunner.query(`DROP TABLE "agent_settings"`);
    }

}
