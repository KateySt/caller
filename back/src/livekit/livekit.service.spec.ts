import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { SipCallError } from 'livekit-server-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveKitService } from './livekit.service.js';

const API_KEY = 'devkey';
const API_SECRET = 'devsecretdevsecretdevsecretdevsecret';
const SERVER_URL = 'ws://localhost:7880';

const createRoom = vi.fn();
const deleteRoom = vi.fn();
const createDispatch = vi.fn();
const createSipParticipant = vi.fn();

vi.mock('livekit-server-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('livekit-server-sdk')>();

  return {
    ...actual,
    LiveKitAPI: class {
      room = { createRoom, deleteRoom };
      agentDispatch = { createDispatch };
      sip = { createSipParticipant };
    },
  };
});

const CONFIG: Record<string, string> = {
  LIVEKIT_URL: SERVER_URL,
  LIVEKIT_API_KEY: API_KEY,
  LIVEKIT_API_SECRET: API_SECRET,
};

const ROOM_NAME = 'pstn-call-3f1b2c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d';
const CALL_ID = '3f1b2c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d';

describe('LiveKitService', () => {
  let service: LiveKitService;

  beforeEach(async () => {
    createRoom.mockReset().mockResolvedValue({ name: ROOM_NAME });
    deleteRoom.mockReset().mockResolvedValue({});
    createDispatch.mockReset().mockResolvedValue({});
    createSipParticipant.mockReset().mockResolvedValue({});

    const moduleRef = await Test.createTestingModule({
      providers: [
        LiveKitService,
        { provide: ConfigService, useValue: { getOrThrow: (key: string) => CONFIG[key] } },
      ],
    }).compile();

    service = moduleRef.get(LiveKitService);
  });

  describe('ensureCallRoom', () => {
    it('creates the room capped to agent + callee', async () => {
      await service.ensureCallRoom(ROOM_NAME);

      expect(createRoom).toHaveBeenCalledWith(
        expect.objectContaining({ name: ROOM_NAME, maxParticipants: 2 }),
      );
    });

    it('surfaces an unreachable SFU as a plain Error, not an HttpException', async () => {
      createRoom.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:7880'));

      await expect(service.ensureCallRoom(ROOM_NAME)).rejects.toThrow(/Failed to create/);
    });
  });

  describe('dispatchCallAgent', () => {
    it('dispatches the named agent with the call id as metadata', async () => {
      await service.dispatchCallAgent(ROOM_NAME, 'caller-voice-agent', CALL_ID);

      expect(createDispatch).toHaveBeenCalledWith(ROOM_NAME, 'caller-voice-agent', {
        metadata: JSON.stringify({ callId: CALL_ID }),
      });
    });
  });

  describe('dialOutboundSip', () => {
    it('dials through the configured trunk and waits for pickup', async () => {
      await service.dialOutboundSip({
        trunkId: 'trunk-1',
        phoneNumber: '+380501234567',
        roomName: ROOM_NAME,
        maxCallDurationSeconds: 600,
      });

      expect(createSipParticipant).toHaveBeenCalledWith(
        'trunk-1',
        '+380501234567',
        ROOM_NAME,
        expect.objectContaining({ waitUntilAnswered: true, maxCallDuration: 600 }),
      );
    });

    it('describes a busy signal in the thrown error', async () => {
      createSipParticipant.mockRejectedValue(
        new SipCallError('SipCallError', 'Busy Here', 503, undefined, {
          sip_status_code: '486',
          sip_status: 'Busy Here',
        }),
      );

      await expect(
        service.dialOutboundSip({
          trunkId: 'trunk-1',
          phoneNumber: '+380501234567',
          roomName: ROOM_NAME,
          maxCallDurationSeconds: 600,
        }),
      ).rejects.toThrow(/Busy/);
    });

    it('describes a no-answer outcome in the thrown error', async () => {
      createSipParticipant.mockRejectedValue(
        new SipCallError('SipCallError', 'Request Timeout', 503, undefined, {
          sip_status_code: '408',
          sip_status: 'Request Timeout',
        }),
      );

      await expect(
        service.dialOutboundSip({
          trunkId: 'trunk-1',
          phoneNumber: '+380501234567',
          roomName: ROOM_NAME,
          maxCallDurationSeconds: 600,
        }),
      ).rejects.toThrow(/No answer/);
    });
  });

  describe('endRoom', () => {
    it('deletes the room', async () => {
      await service.endRoom(ROOM_NAME);

      expect(deleteRoom).toHaveBeenCalledWith(ROOM_NAME);
    });

    it('never throws, even when the SFU is unreachable', async () => {
      deleteRoom.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:7880'));

      await expect(service.endRoom(ROOM_NAME)).resolves.toBeUndefined();
    });
  });
});
