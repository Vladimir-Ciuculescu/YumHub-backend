import { BadGatewayException, Injectable } from "@nestjs/common";
import { PrismaService } from "prisma.service";
import { IsFavoriteDto } from "./favorites.dto";

@Injectable()
export class FavoritesService {
  constructor(private readonly prismaService: PrismaService) {}

  async getIsInFavorites(body: IsFavoriteDto) {
    const { userId, recipeId } = body;

    try {
      const favoriteRecipe = await this.prismaService.users_favorites.findUnique({
        where: {
          recipeId_userId: {
            recipeId,
            userId,
          },
        },
      });

      if (favoriteRecipe) {
        return 1;
      } else {
        return 0;
      }
    } catch (error) {
      console.log(error);
      throw new BadGatewayException();
    }
  }

  async toggleFavoriteRecipe(body: IsFavoriteDto) {
    const { userId, recipeId } = body;

    try {
      const favoriteRecipe = await this.getIsInFavorites(body);

      if (favoriteRecipe) {
        await this.prismaService.users_favorites.delete({ where: { recipeId_userId: { recipeId, userId } } });

        return {
          message: "Recipe deleted from favorites !",
        };
      } else {
        await this.prismaService.users_favorites.create({ data: { recipeId, userId } });

        return {
          message: "Recipe added from favorites !",
        };
      }
    } catch (error) {
      console.log(error);
      throw new BadGatewayException();
    }
  }
}
