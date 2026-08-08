import { Module } from '@nestjs/common';
import { StaysController } from './stays.controller';
import { StaysService } from './stays.service';

@Module({
  controllers: [StaysController],
  providers: [StaysService],
})
export class StaysModule {}
