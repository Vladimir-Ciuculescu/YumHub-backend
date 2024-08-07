import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { RecipeService } from './recipe.service';
import { CreateRecipeDto } from './dtos/create-recipe.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@Controller('recipe')
export class RecipeController {
  constructor(private readonly recipeService: RecipeService) {}

  @UseGuards(JwtAuthGuard)
  @HttpCode(201)
  @Post('/add')
  addRecipe(@Body() body: CreateRecipeDto) {
    return this.recipeService.createRecipe(body);
  }
}
