import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAgentTestSessions1791872162770 implements MigrationInterface {
    name = 'AddAgentTestSessions1791872162770'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "agent_test_session" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "status" character varying(16) NOT NULL, "endReason" character varying(32), "failureReason" text, "systemPrompt" text NOT NULL, "promptSource" character varying(8) NOT NULL, "transcript" jsonb NOT NULL DEFAULT '[]', "roomName" character varying(64), "startedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "endedAt" TIMESTAMP WITH TIME ZONE, "durationSeconds" integer, CONSTRAINT "PK_cb610bf6b99d045ee0ca461b8aa" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_agent_test_session_in_progress" ON "agent_test_session"  ("status") WHERE "status" = 'in_progress'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."UQ_agent_test_session_in_progress"`);
        await queryRunner.query(`DROP TABLE "agent_test_session"`);
    }

}
