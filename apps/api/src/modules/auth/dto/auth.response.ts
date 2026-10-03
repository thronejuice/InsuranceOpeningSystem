import { ApiProperty } from '@nestjs/swagger';

export class MeResponse {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  username: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  fullName: string;

  @ApiProperty({ type: [String], example: ['AGENT'] })
  roles: string[];

  @ApiProperty({ type: [String], example: ['customer.view', 'job.view'] })
  permissions: string[];
}

/** The refresh token is not in the body: it is set as an httpOnly cookie (DESIGN §8). */
export class TokenResponse {
  @ApiProperty()
  accessToken: string;

  @ApiProperty({ description: 'Access token lifetime in seconds', example: 900 })
  expiresIn: number;

  @ApiProperty({ type: MeResponse })
  user: MeResponse;
}
