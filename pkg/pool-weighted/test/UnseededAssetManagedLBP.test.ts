import { ethers } from 'hardhat';
import { expect } from 'chai';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import { fp } from '@balancer-labs/v2-helpers/src/numbers';
import { deployedAt } from '@balancer-labs/v2-helpers/src/contract';
import Vault from '@balancer-labs/v2-helpers/src/models/vault/Vault';
import TokenList from '@balancer-labs/v2-helpers/src/models/tokens/TokenList';
import { Contract } from 'ethers';
import { sharedBeforeEach } from '@balancer-labs/v2-common/sharedBeforeEach';
import UnseededLiquidityBootstrappingPool from '@balancer-labs/v2-helpers/src/models/pools/weighted/UnseededLiquidityBootstrappingPool';

describe('Unseeded AssetManagedLiquidityBootstrappingPool', function () {
  const MAX_TOKENS = 2;
  let manager: SignerWithAddress, other: SignerWithAddress;
  let tokens: TokenList;
  let vault: Vault;

  before('setup signers', async () => {
    [, manager, other] = await ethers.getSigners();
  });

  sharedBeforeEach('deploy tokens', async () => {
    // Because they are sorted, 0 is always the projectToken, and 1 is the reserveToken
    tokens = await TokenList.create(MAX_TOKENS, { sorted: true, varyDecimals: true });
    await tokens.mint({ to: [other], amount: fp(200) });
  });

  let pool: UnseededLiquidityBootstrappingPool;
  let poolController: Contract;
  const weights = [fp(0.9), fp(0.1)];
  const initialBalances = [fp(1000), fp(1.8)];

  context('when deployed from factory', () => {
    sharedBeforeEach('deploy pool', async () => {
      vault = await Vault.create();

      const params = {
        tokens,
        weights,
        vault,
        fromFactory: true,
        from: manager,
      };
      pool = await UnseededLiquidityBootstrappingPool.create(params);
      poolController = await deployedAt('AssetManagedLBPController', await pool.getOwner());
    });

    it('has no asset manager on the project token', async () => {
      const { assetManager } = await pool.getTokenInfo(tokens.get(0));
      expect(assetManager).to.be.zeroAddress;
    });

    it('has an asset manager on the reserve token', async () => {
      const { assetManager } = await pool.getTokenInfo(tokens.get(1));
      expect(assetManager).to.equal(await pool.getOwner());
    });

    describe('fund pool', () => {
      sharedBeforeEach('mint base tokens', async () => {
        // The manager needs to have the base tokens
        tokens.get(0).mint(manager, fp(1000));
        // And some reserve tokens to add liquidity
        tokens.get(1).mint(manager, fp(10));
      });

      it('funds the pool', async () => {
        // Need to allow the pool controller to pull tokens
        await tokens.get(0).approve(poolController, initialBalances[0], { from: manager });

        await poolController.connect(manager).fundPool(initialBalances);

        const { balances } = await vault.getPoolTokens(await pool.getPoolId());
        expect(balances[1]).to.equal(initialBalances[1]);

        // Need a non-zero cash balance for this to work
        await tokens.get(1).approve(poolController, fp(5), { from: manager });

        await poolController.connect(manager).addLiquidity([0, fp(5)], 0);

        await poolController.connect(manager).repaySeedFunds(true);
      });
    });
  });
});
