import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') || [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  const swagger = new DocumentBuilder()
    .setTitle('Hotel OS PMS API')
    .setDescription(
      'Multi-tenant Property Management System API — inventory, reservations, stay operations, housekeeping, night audit and Channex distribution.',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger));

  const port = Number(process.env.PORT || 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Hotel OS API listening on http://localhost:${port}`);
  // eslint-disable-next-line no-console
  console.log(`OpenAPI docs at http://localhost:${port}/docs`);
}

bootstrap();
