import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LoggingMiddleware } from './common/logger/logging.middleware';
import { KpisModule } from './kpis/kpis.module';
import { BusinessModule } from './business/business.module';
import { InfraModule } from './deploy/infra.module';

@Module({
  imports: [KpisModule, BusinessModule, InfraModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Rellena el userId (header x-user-id) en el contexto de logging para que cada
    // log enviado a Application Insights incluya customDimensions.userId.
    consumer.apply(LoggingMiddleware).forRoutes('*');
  }
}
