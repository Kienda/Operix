import { Body, Controller, Get, Headers, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { Request } from 'express';
import { AccountSecurity, Public } from '../security/public.decorator';
import { RateLimit } from '../security/rate-limit';
import type { AuthenticatedRequest } from '../security/request-context';
import { AuthService } from './auth.service';

class LoginDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MinLength(8) @MaxLength(256) password!: string;
  // Optional: when omitted the service resolves the workspace from the user's
  // memberships, and only asks for a slug when the account belongs to several.
  @IsOptional() @IsString() @MaxLength(100) organizationSlug?: string;
  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'mfaCode must be 6 digits' })
  mfaCode?: string;
}
class RefreshDto {
  @IsString() @MaxLength(200) refreshToken!: string;
}
class MfaConfirmDto {
  @IsString() @Matches(/^\d{6}$/, { message: 'code must be 6 digits' }) code!: string;
}
class MfaDisableDto {
  @IsString() @MaxLength(256) password!: string;
  @IsOptional() @IsString() @Matches(/^\d{6}$/) code?: string;
}
class MfaEnrollDto {
  @IsString() @MinLength(8) @MaxLength(256) password!: string;
  @IsOptional() @IsString() @Matches(/^\d{6}$/) code?: string;
}
class ForgotPasswordDto {
  @IsEmail() @MaxLength(254) email!: string;
}
class ResetPasswordDto {
  @IsString() @MaxLength(200) token!: string;
  @IsString() @MinLength(12) @MaxLength(256) password!: string;
}
class AcceptInvitationDto {
  @IsString() @MaxLength(200) token!: string;
  @IsString() @MinLength(1) @MaxLength(80) firstName!: string;
  @IsString() @MinLength(1) @MaxLength(80) lastName!: string;
  @IsString() @MinLength(12) @MaxLength(256) password!: string;
}

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public() @RateLimit('login') @Post('login') login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Headers('user-agent') agent?: string,
  ) {
    return this.auth.login(body, agent, req.ip);
  }
  @Public() @RateLimit('refresh') @Post('refresh') refresh(@Body() body: RefreshDto) {
    return this.auth.refresh(body.refreshToken);
  }
  @AccountSecurity() @Post('logout') logout(@Req() req: AuthenticatedRequest) {
    return this.auth.logout(req.auth);
  }
  @AccountSecurity() @Get('me') me(@Req() req: AuthenticatedRequest) {
    return this.auth.me(req.auth);
  }

  @Public() @RateLimit('password-reset') @Post('forgot-password') forgotPassword(
    @Body() body: ForgotPasswordDto,
  ) {
    return this.auth.forgotPassword(body.email);
  }
  @Public() @RateLimit('password-reset') @Post('reset-password') resetPassword(
    @Body() body: ResetPasswordDto,
  ) {
    return this.auth.resetPassword(body.token, body.password);
  }
  @Public() @RateLimit('invitation') @Post('invitations/accept') acceptInvitation(
    @Body() body: AcceptInvitationDto,
  ) {
    return this.auth.acceptInvitation(body.token, body);
  }

  @AccountSecurity() @RateLimit('mfa') @Post('mfa/enroll') mfaEnroll(
    @Body() body: MfaEnrollDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.auth.mfaEnroll(req.auth, body);
  }
  @AccountSecurity() @RateLimit('mfa') @Post('mfa/confirm') mfaConfirm(
    @Body() body: MfaConfirmDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.auth.mfaConfirm(req.auth, body.code);
  }
  @AccountSecurity() @RateLimit('mfa') @Post('mfa/disable') mfaDisable(
    @Body() body: MfaDisableDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.auth.mfaDisable(req.auth, body.password, body.code);
  }
}
