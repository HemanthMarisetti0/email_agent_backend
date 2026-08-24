import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { beforeEach, describe, it } from 'node:test';

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
function expect(controller: AuthController) {
  throw new Error('Function not implemented.');
}

