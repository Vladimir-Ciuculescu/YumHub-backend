import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { NotificationsService } from "./notifications.service";
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard";
import { MarkAsReadDto, NotificationsDto, ResetBadgeCountDto } from "./notifications.dto";

@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  @Get("/")
  getNotifications(@Query() query: NotificationsDto) {
    return this.notificationsService.getNotifications(query);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  @Post("/reset-badge")
  resetBadgeCount(@Body() body: ResetBadgeCountDto) {
    return this.notificationsService.resetBadgeCountNotification(body);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  @Put("/mark-as-read")
  markAsReadNotification(@Body() params: MarkAsReadDto) {
    return this.notificationsService.markAsReadNotification(params);
  }
}
