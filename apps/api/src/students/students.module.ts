import { Module } from '@nestjs/common';
import { EnrollmentController } from './enrollment.controller';
import { EnrollmentService } from './enrollment.service';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';

@Module({
  controllers: [StudentsController, EnrollmentController],
  providers: [StudentsService, EnrollmentService],
  exports: [StudentsService],
})
export class StudentsModule {}
