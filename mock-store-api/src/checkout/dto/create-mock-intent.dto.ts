import { Transform } from "class-transformer";
import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  Max,
} from "class-validator";

export class CreateMockIntentDto {
  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  @Transform(({ value }) =>
    value == null ? undefined : String(value).trim().toUpperCase(),
  )
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => (value == null ? undefined : String(value).trim()))
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(180)
  expiresInMinutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) => (value == null ? undefined : String(value).trim()))
  merchantOrderId?: string;
}
