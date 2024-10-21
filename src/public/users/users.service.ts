import { HttpException, HttpStatus, Inject, Injectable, forwardRef } from "@nestjs/common";
import { PrismaService } from "prisma.service";
import { CreateUserDto } from "./dtos/create-user.dto";
import { hashPassword } from "src/utils/hashPassword";
import { EmailService } from "src/email/email.service";
import { TokenService } from "src/token/token.service";
import { generateToken } from "src/utils/generateToken";
import { CreateTokenDto } from "src/token/dtos/create-token.dto";
import { EditProfileDto, GetProfileDto } from "./users.dto";
import { AuthService } from "src/auth/auth.service";
import { JwtService } from "@nestjs/jwt";

@Injectable()
export class UsersService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly emailService: EmailService,
    @Inject(forwardRef(() => TokenService))
    private readonly tokenService: TokenService,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
  ) {}

  async findUser(email: string) {
    const user = await this.prismaService.users.findUnique({
      where: {
        email,
      },
    });

    return user;
  }

  async createUser(body: CreateUserDto) {
    const { email, username, firstName, lastName, password } = body;

    const existentUser = await this.prismaService.users.findFirst({
      where: { OR: [{ email }, { username }] },
    });

    let errors: any = {};

    if (existentUser) {
      if (existentUser.email === email) {
        errors.email = "Email already in use";
      }

      if (existentUser.username === username) {
        errors.username = "Username already in use";
      }

      throw new HttpException(errors, HttpStatus.CONFLICT);
    }

    const hashedPassword = await hashPassword(password);

    const token = generateToken(4);

    const user = await this.prismaService.users.create({
      data: {
        username,
        email,
        password: hashedPassword,
        firstName,
        lastName,
      },
    });

    const tokenPayload: CreateTokenDto = {
      userId: user.id,
      email,
    };

    await this.prismaService.auth_methods.create({
      data: {
        provider: null,
        providerId: null,
        user: { connect: { id: user.id } },
      },
    });

    await this.tokenService.generateToken(token, tokenPayload);

    await this.emailService.sendMail(
      email,
      process.env.MAILTRAP_SENDER,
      `Verification Token - YumHub (${token})`,
      `Dear user,
Thank you for creating an account with us! To complete your registration, please verify your email address by entering the following 4-digit token in the app:

Verification Token: ${token}

This token is valid for 24 hours. If you did not request this verification, please ignore this email.

Best regards,
Yumhub`,
    );

    return user;
  }

  async validateUser(userId: number) {
    try {
      await this.prismaService.users.update({
        where: { id: userId },
        data: { isVerified: true },
      });
    } catch (error) {
      console.log(error);
    }
  }

  async getProfile(payload: GetProfileDto) {
    const { id } = payload;

    try {
      const data = await this.prismaService.users.findFirst({
        where: { id },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          photoUrl: true,
        },
      });

      const accessToken = await this.jwtService.signAsync(data, {
        secret: process.env.JWT_SECRET_KEY,
        expiresIn: "10m",
      });

      return accessToken;
    } catch (error) {
      console.log(error);
      throw new HttpException({ error }, HttpStatus.CONFLICT);
    }
  }

  async updateProfile(payload: EditProfileDto) {
    return payload;
  }
}
