import { Controller, Get, Inject } from '@nestjs/common';
import { AppService } from './app.service.js';

@Controller()
export class AppController {
  // Explicit @Inject: NestJS's implicit constructor-param DI relies on TypeScript's
  // emitted `design:paramtypes` metadata, which `tsx` (used by `src/agent-worker/main.ts`
  // to run this module tree outside `nest build`) does not produce.
  constructor(@Inject(AppService) private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
