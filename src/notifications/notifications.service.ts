import { BadGatewayException, Injectable } from "@nestjs/common";
import { PrismaService } from "prisma.service";
import { ExpoService } from "src/expo/expo.service";
import { MarkAsReadDto, ResetBadgeCountDto } from "./notifications.dto";

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly expoService: ExpoService,
  ) {}

  async getNotifications(query) {
    const { userId, page, limit } = query;

    try {
      const notifications = await this.prismaService.notifications.findMany({
        where: { userId },
        select: {
          id: true,
          title: true,
          body: true,
          data: true,
          createdAt: true,
          read: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        skip: limit * page,
        take: limit,
      });

      // Get recipe photos for notifications that have a recipeId
      const notificationsWithPhotos = await Promise.all(
        notifications.map(async (notification) => {
          if (notification.data && notification.data["recipeId"]) {
            const recipe = await this.prismaService.recipes.findUnique({
              where: { id: notification.data["recipeId"] },
              select: { photoUrl: true },
            });
            return {
              ...notification,
              data: {
                //@ts-ignore
                ...notification.data,
                recipePhotoUrl: recipe?.photoUrl || null,
              },
            };
          }
          return {
            ...notification,
            data: {
              //@ts-ignore
              ...notification.data,
              recipePhotoUrl: null,
            },
          };
        }),
      );

      return notificationsWithPhotos;
    } catch (error) {
      console.log("Error fetching the notifications ! :", error);
      throw new BadGatewayException();
    }
  }

  async addToFavoritesNotification(userId: number, senderId: number, recipeId: number) {
    const sender = await this.prismaService.users.findFirst({ where: { id: senderId } });

    await this.prismaService.user_devices.updateMany({
      where: { userId },
      data: {
        badgeCount: {
          increment: 1,
        },
      },
    });

    const devices = await this.prismaService.user_devices.findMany({ where: { userId: userId } });

    const deviceTokens = devices
      .filter((devices) => devices.notificationsEnabled)
      .map((device) => ({ deviceToken: device.deviceToken, badge: device.badgeCount }));

    await this.prismaService.notifications.create({
      data: {
        userId,
        title: `${sender.firstName} ${sender.lastName}`,
        body: "has appreciated your recipe",
        data: {
          recipeId,
        },
      },
    });

    const notificationPayload = {
      title: `${sender.firstName} ${sender.lastName}`,
      body: "has appreciated your recipe",
      data: {
        url: "(tabs)/notifications",
      },
    };

    await this.expoService.sendExpoPushNotification(deviceTokens, notificationPayload);
  }

  async resetBadgeCountNotification(body: ResetBadgeCountDto) {
    const { deviceToken } = body;

    try {
      await this.prismaService.user_devices.update({ where: { deviceToken }, data: { badgeCount: 0 } });
    } catch (error) {
      console.log("Error fetching the notifications ! :", error);
      throw new BadGatewayException();
    }
  }

  async markAsReadNotification(params: MarkAsReadDto) {
    const { notificationId } = params;

    try {
      await this.prismaService.notifications.update({ where: { id: notificationId }, data: { read: true } });
    } catch (error) {
      console.log("Error marking notification as read :", error);
      throw new BadGatewayException();
    }
  }
}
