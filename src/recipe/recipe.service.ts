import { BadGatewayException, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { CreateRecipeDto, EditRecipeDto, EditRecipePhotoDto, RecipesDto, RecipesPerUserDto } from "./dtos/recipe.dtos";
import { PrismaService } from "prisma.service";
import { IngredientsService } from "src/ingredients/ingredients.service";
import { UnitsService } from "src/units/units.service";
import { recipes_ingredients } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

@Injectable()
export class RecipeService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly ingredientsService: IngredientsService,
    private readonly unitsService: UnitsService,
  ) {}

  //TODO : Adjust the query so that it filters number of calories too
  async getRecipes(query: RecipesDto) {
    const { title, categories, caloriesRange, preparationTimeRange } = query;

    const recipes = await this.prismaService.$queryRaw`SELECT 
    r.id AS recipe_id,
    r.title AS recipe_title,
    SUM(ri.calories) AS total_calories
  FROM 
    recipes r
  JOIN 
    recipes_ingredients ri ON r.id = ri.recipe_id
  GROUP BY 
    r.id, r.title
  HAVING 
    SUM(ri.calories) BETWEEN ${caloriesRange[0]} AND ${caloriesRange[1]}
  ORDER BY 
    total_calories;`;

    return recipes;
  }

  async getRecipesByUser(query: RecipesPerUserDto) {
    const { page, limit, userId } = query;

    try {
      const recipes = await this.prismaService
        .$queryRaw`SELECT r.id, r.title, r.servings, r."photo_url" AS "photoUrl", r.type, r."preparation_time" AS "preparationTime", CAST(ROUND(SUM(ri.calories::numeric), 2) AS float8) AS "totalCalories"
      FROM recipes r
      JOIN recipes_ingredients ri ON r.id = ri."recipe_id"
      WHERE r."user_id" = ${userId}
      GROUP BY r.id, r.title, r.servings, r.type, r."preparation_time" 
      ORDER BY r."created_at" DESC
      OFFSET ${page * limit} ROWS 
      FETCH NEXT ${limit} ROWS only;`;

      return recipes;
    } catch (error) {
      console.log(error);

      throw new BadGatewayException();
    }
  }

  async createRecipe(payload: CreateRecipeDto) {
    const { userId, title, servings, preparationTime, type, ingredients, steps } = payload;

    try {
      return await this.prismaService.$transaction(async (tsx) => {
        const newRecipe = await tsx.recipes.create({
          data: {
            title,
            userId,
            servings,
            preparationTime,
            type,
          },
        });

        for (let ingredient of ingredients) {
          const { foodId, name, measures, unit, calories, carbs, proteins, fats } = ingredient;

          const existentIngredient = await this.ingredientsService.getIngredient(foodId);

          let ingredientId: number;

          if (existentIngredient) {
            ingredientId = existentIngredient.id;
          } else {
            const payload = {
              foodId,
              name,
            };

            const newIngredient = await this.ingredientsService.addIngredient(payload);

            ingredientId = newIngredient.id;
          }

          for (let measure of measures) {
            const { uri, label } = measure;

            const payload = {
              uri,
              label,
            };

            const exitingMeasure = await this.unitsService.getUnit(payload);

            if (exitingMeasure) {
            } else {
              await this.unitsService.addUnit(payload);
            }
          }

          const ingredientUnit = await tsx.units.findFirst({
            where: {
              label: unit,
            },
          });

          await tsx.recipes_ingredients.create({
            data: {
              recipeId: newRecipe.id,
              ingredientId,
              unitId: ingredientUnit.id,
              quantity: ingredient.quantity,
              calories,
              proteins,
              carbs,
              fats,
            },
          });
        }
        const stepsPayload = steps.map((step) => ({
          recipeId: newRecipe.id,
          step: step.step,
          text: step.text,
        }));
        await tsx.steps.createMany({
          data: stepsPayload,
        });
        return newRecipe;
      });
    } catch (error) {
      console.log(error);

      throw new HttpException(
        {
          error: "Could not create recipe !",
        },
        HttpStatus.CONFLICT,
      );
    }
  }

  async editRecipePhoto(payload: EditRecipePhotoDto) {
    const { id, photoUrl } = payload;

    await this.prismaService.recipes.update({
      where: { id },
      data: { photoUrl },
    });
  }

  async editRecipe(payload: EditRecipeDto) {
    const { recipe, ingredientsIds, stepsIds } = payload;

    try {
      const { id, title, servings, photoUrl, ingredients, steps, type, preparationTime } = recipe;

      return await this.prismaService.$transaction(async (tsx) => {
        await tsx.recipes.update({
          where: { id },
          data: { title, servings, photoUrl, type, preparationTime },
        });

        if (ingredientsIds) {
          await tsx.recipes_ingredients.deleteMany({
            where: { AND: [{ ingredientId: { in: ingredientsIds } }, { recipeId: id }] },
          });
        }

        for (let ingredient of ingredients) {
          const { calories, carbs, proteins, fats, quantity, measure } = ingredient;

          const unit = await tsx.units.findFirst({ where: { label: measure } });

          await tsx.recipes_ingredients.updateMany({
            where: { AND: [{ recipeId: recipe.id }, { ingredientId: ingredient.id }] },
            data: { calories, carbs, proteins, fats, quantity, unitId: unit.id },
          });
        }

        if (stepsIds) {
          await tsx.steps.deleteMany({ where: { AND: [{ id: { in: stepsIds } }, { recipeId: id }] } });
        }

        for (let step of steps) {
          await tsx.steps.update({
            where: { id: step.id },
            data: { text: step.description },
          });
        }
      });
    } catch (error) {
      console.log(error);
      throw new HttpException({ error }, HttpStatus.CONFLICT);
    }
  }

  async getRecipe(id) {
    try {
      const recipe = await this.prismaService.$queryRaw`SELECT 
     r.id,
     r.title,
     r.servings,
     r."photo_url" AS "photoUrl",
     r.type,
     r."preparation_time" AS "preparationTime",
     CAST(ROUND(SUM(ri.calories::numeric), 2) AS float8) AS "totalCalories",
    (
        SELECT json_agg(
          json_build_object(
            'id', i.id,
            'foodId', i."food_id", 
            'name', i.name,
            'quantity', ri.quantity,
            'unitId', u.id,
            'unit', u.label,
            'calories', CAST(ROUND(ri.calories::numeric, 2) AS float8),
            'carbs', CAST(ROUND(ri.carbs::numeric, 2) AS float8),
            'fats', CAST(ROUND(ri.fats::numeric, 2) AS float8),
            'proteins', CAST(ROUND(ri.proteins::numeric, 2) AS float8)
          )
        )
        FROM recipes_ingredients ri
        LEFT JOIN ingredients i ON ri."ingredient_id" = i.id
        LEFT JOIN units u ON ri."unit_id" = u.id
        WHERE ri."recipe_id" = r.id
      ) AS ingredients,
    
    (
        SELECT json_agg(
          json_build_object(
            'id', s.id,
            'step', s.step,
            'text', s.text
          )
        )
        FROM steps s
        WHERE s."recipe_id" = r.id
      ) AS steps
     
     
   FROM 
     recipes r
   LEFT JOIN 
     recipes_ingredients ri ON r.id = ri."recipe_id"
   LEFT JOIN 
     ingredients i ON ri."ingredient_id" = i.id
   LEFT JOIN 
     units u ON ri."unit_id" = u.id
   LEFT JOIN
     steps s ON s."recipe_id" = r.id
   WHERE 
     r.id = ${id} 
   GROUP BY 
     r.id;`;

      return recipe[0];
    } catch (error) {
      console.log(error);
      throw new HttpException({ error }, HttpStatus.CONFLICT);
    }
  }
}
