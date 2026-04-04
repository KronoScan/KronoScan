# Phase 1A: StreamVault Smart Contract — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy StreamVault.sol on Arc testnet with full test coverage — tiered pricing, top-up, grace period, auto-termination, solvency checks.

**Architecture:** Single Foundry project at repo root. StreamVault is the only contract. MockUSDC for testing. OpenZeppelin SafeERC20 as sole dependency. Tests use Foundry's `forge-std` with `vm.warp` for time manipulation.

**Tech Stack:** Solidity ^0.8.30, Foundry (forge/cast/anvil), OpenZeppelin Contracts, Arc testnet

---

## File Map

| File | Responsibility |
|------|---------------|
| `foundry.toml` | Foundry config — solc version, remappings, Arc testnet RPC |
| `src/StreamVault.sol` | Core contract — stream lifecycle, tiered pricing, solvency |
| `src/mocks/MockUSDC.sol` | ERC20 mock for testing — mintable USDC with 6 decimals |
| `test/StreamVault.t.sol` | Full test suite — all 6 contract functions |
| `script/Deploy.s.sol` | Deployment script for Arc testnet |
| `.env.example` | Template for required env vars |
| `.gitignore` | Standard Foundry ignores |

---

### Task 1: Initialize Foundry Project + Git Repo

**Files:**
- Create: `foundry.toml`
- Create: `.gitignore`
- Create: `.env.example`

- [ ] **Step 1: Initialize git repo**

```bash
cd /home/mbarr/Cannes2026
git init
```

- [ ] **Step 2: Initialize Foundry project**

```bash
cd /home/mbarr/Cannes2026
forge init --no-commit --no-git .
```

This creates `src/Counter.sol`, `test/Counter.t.sol`, `script/Counter.s.sol`, `foundry.toml`, and `lib/forge-std`.

- [ ] **Step 3: Remove Foundry boilerplate files**

```bash
rm src/Counter.sol test/Counter.t.sol script/Counter.s.sol
```

- [ ] **Step 4: Install OpenZeppelin Contracts**

```bash
forge install OpenZeppelin/openzeppelin-contracts --no-commit
```

- [ ] **Step 5: Configure foundry.toml**

Replace the generated `foundry.toml` with:

```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
solc = "0.8.30"
optimizer = true
optimizer_runs = 200

remappings = [
    "@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/",
]

[rpc_endpoints]
arc_testnet = "${ARC_TESTNET_RPC}"

[etherscan]
arc_testnet = { key = "${ETHERSCAN_API_KEY}", url = "${ARCSCAN_API_URL}" }
```

- [ ] **Step 6: Create .env.example**

```
PRIVATE_KEY=0x...
ARC_TESTNET_RPC=https://...
USDC_ADDRESS=0x...
COORDINATOR_ADDRESS=0x...
ETHERSCAN_API_KEY=
ARCSCAN_API_URL=
```

- [ ] **Step 7: Create .gitignore**

```
# Foundry
out/
cache/

# Env
.env

# Node (for later phases)
node_modules/

# OS
.DS_Store
```

- [ ] **Step 8: Verify Foundry compiles clean**

Run: `forge build`
Expected: Compilation successful (nothing to compile yet, but config is valid).

- [ ] **Step 9: Commit**

```bash
git add foundry.toml .gitignore .env.example lib/ CLAUDE.md docs/
git commit -m "chore: initialize Foundry project with OpenZeppelin"
```

---

### Task 2: MockUSDC Contract

**Files:**
- Create: `src/mocks/MockUSDC.sol`

- [ ] **Step 1: Write MockUSDC**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Mintable ERC20 with 6 decimals for testing (mirrors real USDC)
contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `forge build`
Expected: `Compiler run successful`

- [ ] **Step 3: Commit**

```bash
git add src/mocks/MockUSDC.sol
git commit -m "feat: add MockUSDC with 6 decimals for testing"
```

---

### Task 3: StreamVault — Core Struct, Constructor, openStream

**Files:**
- Create: `src/StreamVault.sol`
- Create: `test/StreamVault.t.sol`

We build the contract incrementally: first `openStream` + tiered pricing, then add functions one by one with TDD.

- [ ] **Step 1: Write the test for openStream (verified buyer)**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import "../src/StreamVault.sol";
import "../src/mocks/MockUSDC.sol";

contract StreamVaultTest is Test {
    StreamVault public vault;
    MockUSDC public usdc;

    address public coordinator = makeAddr("coordinator");
    address public buyer = makeAddr("buyer");
    address public seller = makeAddr("seller");

    uint256 public constant RATE = 100; // $0.0001/sec
    uint256 public constant DEPOSIT = 1_000_000; // 1 USDC

    function setUp() public {
        usdc = new MockUSDC();
        vault = new StreamVault(address(usdc), coordinator);

        usdc.mint(buyer, 10_000_000); // 10 USDC
        vm.prank(buyer);
        usdc.approve(address(vault), type(uint256).max);
    }

    function test_openStream_verified() public {
        vm.prank(buyer);
        bytes32 streamId = vault.openStream(seller, RATE, DEPOSIT, true);

        (
            address sBuyer,
            address sSeller,
            uint256 sBaseRate,
            uint256 sEffectiveRate,
            uint256 sDeposit,
            uint256 sStartTime,
            uint256 sClosedTime,
            StreamVault.StreamStatus sStatus,
            bool sVerified
        ) = vault.streams(streamId);

        assertEq(sBuyer, buyer);
        assertEq(sSeller, seller);
        assertEq(sBaseRate, RATE);
        // Verified gets 20% discount: 100 * 8000 / 10000 = 80
        assertEq(sEffectiveRate, 80);
        assertEq(sDeposit, DEPOSIT);
        assertEq(sStartTime, block.timestamp);
        assertEq(sClosedTime, 0);
        assertEq(uint8(sStatus), uint8(StreamVault.StreamStatus.ACTIVE));
        assertTrue(sVerified);

        // USDC transferred to vault
        assertEq(usdc.balanceOf(address(vault)), DEPOSIT);
        assertEq(usdc.balanceOf(buyer), 10_000_000 - DEPOSIT);
    }

    function test_openStream_unverified() public {
        vm.prank(buyer);
        bytes32 streamId = vault.openStream(seller, RATE, DEPOSIT, false);

        (,, uint256 sBaseRate, uint256 sEffectiveRate,,,,, bool sVerified) = vault.streams(streamId);

        assertEq(sBaseRate, RATE);
        // Unverified pays full rate
        assertEq(sEffectiveRate, RATE);
        assertFalse(sVerified);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `forge test --match-contract StreamVaultTest -v`
Expected: Compilation error — `StreamVault` not found.

- [ ] **Step 3: Write StreamVault with openStream**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract StreamVault {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    address public coordinator;

    uint256 public constant GRACE_PERIOD = 30;
    uint256 public constant VERIFIED_DISCOUNT_BPS = 2000;
    uint256 public constant BPS_BASE = 10000;

    enum StreamStatus { ACTIVE, CLOSED, TERMINATED }

    struct Stream {
        address buyer;
        address seller;
        uint256 baseRatePerSecond;
        uint256 effectiveRate;
        uint256 depositedAmount;
        uint256 startTime;
        uint256 closedTime;
        StreamStatus status;
        bool buyerVerified;
    }

    mapping(bytes32 => Stream) public streams;
    uint256 public streamCount;

    event StreamOpened(
        bytes32 indexed streamId, address buyer, address seller,
        uint256 baseRate, uint256 effectiveRate, uint256 deposit, bool verified
    );
    event StreamClosed(bytes32 indexed streamId, uint256 consumed, uint256 refunded);
    event StreamTerminated(bytes32 indexed streamId, uint256 consumed, uint256 refunded);
    event StreamToppedUp(bytes32 indexed streamId, uint256 amount, uint256 newTotal);

    modifier onlyCoordinator() {
        require(msg.sender == coordinator, "Only coordinator");
        _;
    }

    constructor(address _usdc, address _coordinator) {
        usdc = IERC20(_usdc);
        coordinator = _coordinator;
    }

    function _applyDiscount(uint256 baseRate, bool verified) internal pure returns (uint256) {
        if (verified) {
            return baseRate * (BPS_BASE - VERIFIED_DISCOUNT_BPS) / BPS_BASE;
        }
        return baseRate;
    }

    function openStream(
        address seller,
        uint256 baseRatePerSecond,
        uint256 deposit,
        bool worldIdVerified
    ) external returns (bytes32 streamId) {
        usdc.safeTransferFrom(msg.sender, address(this), deposit);

        uint256 effectiveRate = _applyDiscount(baseRatePerSecond, worldIdVerified);
        streamId = keccak256(abi.encodePacked(msg.sender, seller, block.timestamp, streamCount++));

        streams[streamId] = Stream({
            buyer: msg.sender,
            seller: seller,
            baseRatePerSecond: baseRatePerSecond,
            effectiveRate: effectiveRate,
            depositedAmount: deposit,
            startTime: block.timestamp,
            closedTime: 0,
            status: StreamStatus.ACTIVE,
            buyerVerified: worldIdVerified
        });

        emit StreamOpened(streamId, msg.sender, seller, baseRatePerSecond, effectiveRate, deposit, worldIdVerified);
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `forge test --match-contract StreamVaultTest -v`
Expected: 2 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/StreamVault.sol test/StreamVault.t.sol
git commit -m "feat: StreamVault openStream with tiered pricing"
```

---

### Task 4: isSolvent + timeRemaining

**Files:**
- Modify: `src/StreamVault.sol`
- Modify: `test/StreamVault.t.sol`

- [ ] **Step 1: Write tests for isSolvent and timeRemaining**

Add to `StreamVaultTest`:

```solidity
    function test_isSolvent_active_stream() public {
        vm.prank(buyer);
        bytes32 streamId = vault.openStream(seller, RATE, DEPOSIT, false);

        // Immediately solvent
        assertTrue(vault.isSolvent(streamId));

        // After 5000 seconds at rate 100: consumed = 500_000 < 1_000_000 deposit
        vm.warp(block.timestamp + 5000);
        assertTrue(vault.isSolvent(streamId));

        // After 10000 seconds: consumed = 1_000_000 = deposit (exactly at limit)
        vm.warp(block.timestamp + 5000);
        assertFalse(vault.isSolvent(streamId));
    }

    function test_isSolvent_verified_lasts_longer() public {
        vm.prank(buyer);
        bytes32 streamId = vault.openStream(seller, RATE, DEPOSIT, true);

        // Effective rate = 80, so 1_000_000 / 80 = 12500 seconds
        vm.warp(block.timestamp + 12000);
        assertTrue(vault.isSolvent(streamId));

        vm.warp(block.timestamp + 500);
        assertFalse(vault.isSolvent(streamId));
    }

    function test_timeRemaining() public {
        vm.prank(buyer);
        bytes32 streamId = vault.openStream(seller, RATE, DEPOSIT, false);

        // At start: 1_000_000 / 100 = 10000 seconds
        assertEq(vault.timeRemaining(streamId), 10000);

        // After 3000 seconds: (1_000_000 - 300_000) / 100 = 7000
        vm.warp(block.timestamp + 3000);
        assertEq(vault.timeRemaining(streamId), 7000);

        // After insolvency: 0
        vm.warp(block.timestamp + 8000);
        assertEq(vault.timeRemaining(streamId), 0);
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `forge test --match-test "test_isSolvent|test_timeRemaining" -v`
Expected: FAIL — functions not found.

- [ ] **Step 3: Add isSolvent, _consumed, and timeRemaining to StreamVault.sol**

Add these functions after `openStream`:

```solidity
    function _consumed(Stream storage s) internal view returns (uint256) {
        uint256 end = s.closedTime > 0 ? s.closedTime : block.timestamp;
        uint256 elapsed = end - s.startTime;
        uint256 amount = elapsed * s.effectiveRate;
        return amount > s.depositedAmount ? s.depositedAmount : amount;
    }

    function isSolvent(bytes32 streamId) external view returns (bool) {
        Stream storage s = streams[streamId];
        if (s.status != StreamStatus.ACTIVE) return false;
        return _consumed(s) < s.depositedAmount;
    }

    function timeRemaining(bytes32 streamId) external view returns (uint256) {
        Stream storage s = streams[streamId];
        if (s.status != StreamStatus.ACTIVE) return 0;
        uint256 consumed = _consumed(s);
        if (consumed >= s.depositedAmount) return 0;
        return (s.depositedAmount - consumed) / s.effectiveRate;
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `forge test --match-test "test_isSolvent|test_timeRemaining" -v`
Expected: 3 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/StreamVault.sol test/StreamVault.t.sol
git commit -m "feat: add isSolvent and timeRemaining view functions"
```

---

### Task 5: topUp

**Files:**
- Modify: `src/StreamVault.sol`
- Modify: `test/StreamVault.t.sol`

- [ ] **Step 1: Write tests for topUp**

Add to `StreamVaultTest`:

```solidity
    function test_topUp() public {
        vm.prank(buyer);
        bytes32 streamId = vault.openStream(seller, RATE, DEPOSIT, false);

        uint256 topUpAmount = 500_000; // 0.5 USDC

        vm.prank(buyer);
        vault.topUp(streamId, topUpAmount);

        (,,,, uint256 sDeposit,,,,) = vault.streams(streamId);
        assertEq(sDeposit, DEPOSIT + topUpAmount);
        assertEq(usdc.balanceOf(address(vault)), DEPOSIT + topUpAmount);
    }

    function test_topUp_extends_time() public {
        vm.prank(buyer);
        bytes32 streamId = vault.openStream(seller, RATE, DEPOSIT, false);

        // Initially 10000 seconds remaining
        assertEq(vault.timeRemaining(streamId), 10000);

        vm.prank(buyer);
        vault.topUp(streamId, DEPOSIT); // double the deposit

        // Now 20000 seconds remaining
        assertEq(vault.timeRemaining(streamId), 20000);
    }

    function test_topUp_onlyBuyer() public {
        vm.prank(buyer);
        bytes32 streamId = vault.openStream(seller, RATE, DEPOSIT, false);

        vm.prank(seller);
        vm.expectRevert("Only buyer");
        vault.topUp(streamId, 500_000);
    }

    function test_topUp_onlyActive() public {
        vm.prank(buyer);
        bytes32 streamId = vault.openStream(seller, RATE, DEPOSIT, false);

        // Close the stream first
        vm.prank(coordinator);
        vault.closeStream(streamId, 0);

        vm.prank(buyer);
        vm.expectRevert("Not active");
        vault.topUp(streamId, 500_000);
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `forge test --match-test "test_topUp" -v`
Expected: FAIL — `topUp` not found (and `closeStream` not found for the last test).

- [ ] **Step 3: Add topUp to StreamVault.sol**

Add after `timeRemaining`:

```solidity
    function topUp(bytes32 streamId, uint256 amount) external {
        Stream storage s = streams[streamId];
        require(s.status == StreamStatus.ACTIVE, "Not active");
        require(msg.sender == s.buyer, "Only buyer");

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        s.depositedAmount += amount;

        emit StreamToppedUp(streamId, amount, s.depositedAmount);
    }
```

Note: `test_topUp_onlyActive` will still fail because `closeStream` doesn't exist yet. We'll add it in the next task and that test will pass then.

- [ ] **Step 4: Run the tests that should pass now**

Run: `forge test --match-test "test_topUp_onlyBuyer|test_topUp_extends|test_topUp " -v`

Note: `test_topUp_onlyActive` will fail until Task 6. Run the other 3:

Run: `forge test --match-test "test_topUp$|test_topUp_extends|test_topUp_onlyBuyer" -v`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add src/StreamVault.sol test/StreamVault.t.sol
git commit -m "feat: add topUp to extend stream deposits"
```

---

### Task 6: closeStream

**Files:**
- Modify: `src/StreamVault.sol`
- Modify: `test/StreamVault.t.sol`

- [ ] **Step 1: Write tests for closeStream**

Add to `StreamVaultTest`:

```solidity
    function test_closeStream_partial() public {
        vm.prank(buyer);
        bytes32 streamId = vault.openStream(seller, RATE, DEPOSIT, false);

        uint256 consumed = 300_000; // 0.3 USDC consumed

        uint256 buyerBefore = usdc.balanceOf(buyer);
        uint256 sellerBefore = usdc.balanceOf(seller);

        vm.prank(coordinator);
        vault.closeStream(streamId, consumed);

        // Seller gets consumed amount
        assertEq(usdc.balanceOf(seller), sellerBefore + consumed);
        // Buyer gets refund
        assertEq(usdc.balanceOf(buyer), buyerBefore + (DEPOSIT - consumed));
        // Vault is empty
        assertEq(usdc.balanceOf(address(vault)), 0);

        (,,,,, uint256 sStartTime, uint256 sClosedTime, StreamVault.StreamStatus sStatus,) = vault.streams(streamId);
        assertEq(uint8(sStatus), uint8(StreamVault.StreamStatus.CLOSED));
        assertGt(sClosedTime, 0);
    }

    function test_closeStream_full_consumption() public {
        vm.prank(buyer);
        bytes32 streamId = vault.openStream(seller, RATE, DEPOSIT, false);

        vm.prank(coordinator);
        vault.closeStream(streamId, DEPOSIT);

        assertEq(usdc.balanceOf(seller), DEPOSIT);
        assertEq(usdc.balanceOf(address(vault)), 0);
    }

    function test_closeStream_zero_consumption() public {
        vm.prank(buyer);
        bytes32 streamId = vault.openStream(seller, RATE, DEPOSIT, false);

        uint256 buyerBefore = usdc.balanceOf(buyer);

        vm.prank(coordinator);
        vault.closeStream(streamId, 0);

        // Full refund to buyer
        assertEq(usdc.balanceOf(buyer), buyerBefore + DEPOSIT);
        assertEq(usdc.balanceOf(seller), 0);
    }

    function test_closeStream_onlyCoordinator() public {
        vm.prank(buyer);
        bytes32 streamId = vault.openStream(seller, RATE, DEPOSIT, false);

        vm.prank(buyer);
        vm.expectRevert("Only coordinator");
        vault.closeStream(streamId, 0);
    }

    function test_closeStream_consumedExceedsDeposit() public {
        vm.prank(buyer);
        bytes32 streamId = vault.openStream(seller, RATE, DEPOSIT, false);

        vm.prank(coordinator);
        vm.expectRevert("Consumed exceeds deposit");
        vault.closeStream(streamId, DEPOSIT + 1);
    }

    function test_closeStream_notActive() public {
        vm.prank(buyer);
        bytes32 streamId = vault.openStream(seller, RATE, DEPOSIT, false);

        vm.prank(coordinator);
        vault.closeStream(streamId, 0);

        // Try to close again
        vm.prank(coordinator);
        vm.expectRevert("Not active");
        vault.closeStream(streamId, 0);
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `forge test --match-test "test_closeStream" -v`
Expected: FAIL — `closeStream` not found.

- [ ] **Step 3: Add closeStream to StreamVault.sol**

Add after `topUp`:

```solidity
    function closeStream(bytes32 streamId, uint256 actualConsumed) external onlyCoordinator {
        Stream storage s = streams[streamId];
        require(s.status == StreamStatus.ACTIVE, "Not active");
        require(actualConsumed <= s.depositedAmount, "Consumed exceeds deposit");

        s.status = StreamStatus.CLOSED;
        s.closedTime = block.timestamp;

        uint256 refund = s.depositedAmount - actualConsumed;
        if (refund > 0) {
            usdc.safeTransfer(s.buyer, refund);
        }
        if (actualConsumed > 0) {
            usdc.safeTransfer(s.seller, actualConsumed);
        }

        emit StreamClosed(streamId, actualConsumed, refund);
    }
```

- [ ] **Step 4: Run ALL tests (including the topUp_onlyActive test from Task 5)**

Run: `forge test -v`
Expected: ALL tests pass (including `test_topUp_onlyActive` which needed `closeStream`).

- [ ] **Step 5: Commit**

```bash
git add src/StreamVault.sol test/StreamVault.t.sol
git commit -m "feat: add closeStream with refund distribution"
```

---

### Task 7: terminateInsolvency

**Files:**
- Modify: `src/StreamVault.sol`
- Modify: `test/StreamVault.t.sol`

- [ ] **Step 1: Write tests for terminateInsolvency**

Add to `StreamVaultTest`:

```solidity
    function test_terminateInsolvency() public {
        vm.prank(buyer);
        bytes32 streamId = vault.openStream(seller, RATE, DEPOSIT, false);

        // Rate=100, deposit=1_000_000 → insolvency at 10000s
        // Grace period = 30s → terminable at 10030s
        vm.warp(block.timestamp + 10031);

        uint256 sellerBefore = usdc.balanceOf(seller);

        // Anyone can call (using a random address)
        address anyone = makeAddr("anyone");
        vm.prank(anyone);
        vault.terminateInsolvency(streamId);

        // Seller gets full deposit (consumed = deposit)
        assertEq(usdc.balanceOf(seller), sellerBefore + DEPOSIT);
        // Vault is empty
        assertEq(usdc.balanceOf(address(vault)), 0);

        (,,,,,, uint256 sClosedTime, StreamVault.StreamStatus sStatus,) = vault.streams(streamId);
        assertEq(uint8(sStatus), uint8(StreamVault.StreamStatus.TERMINATED));
        // closedTime should be at insolvency point (10000s), not call time (10031s)
        assertEq(sClosedTime, 1 + 10000); // block.timestamp starts at 1 in Foundry
    }

    function test_terminateInsolvency_stillSolvent() public {
        vm.prank(buyer);
        bytes32 streamId = vault.openStream(seller, RATE, DEPOSIT, false);

        vm.warp(block.timestamp + 5000); // still solvent

        vm.expectRevert("Still solvent");
        vault.terminateInsolvency(streamId);
    }

    function test_terminateInsolvency_gracePeriodActive() public {
        vm.prank(buyer);
        bytes32 streamId = vault.openStream(seller, RATE, DEPOSIT, false);

        // Insolvent but within grace period (10000 + 15 < 10030)
        vm.warp(block.timestamp + 10015);

        vm.expectRevert("Grace period active");
        vault.terminateInsolvency(streamId);
    }

    function test_terminateInsolvency_verified_timing() public {
        vm.prank(buyer);
        bytes32 streamId = vault.openStream(seller, RATE, DEPOSIT, true);

        // Effective rate = 80, so insolvency at 1_000_000/80 = 12500s
        // Terminable at 12530s
        vm.warp(block.timestamp + 12500);

        vm.expectRevert("Still solvent");
        vault.terminateInsolvency(streamId);

        vm.warp(block.timestamp + 31);
        vault.terminateInsolvency(streamId);

        (,,,,,,, StreamVault.StreamStatus sStatus,) = vault.streams(streamId);
        assertEq(uint8(sStatus), uint8(StreamVault.StreamStatus.TERMINATED));
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `forge test --match-test "test_terminateInsolvency" -v`
Expected: FAIL — `terminateInsolvency` not found.

- [ ] **Step 3: Add terminateInsolvency to StreamVault.sol**

Add after `closeStream`:

```solidity
    function terminateInsolvency(bytes32 streamId) external {
        Stream storage s = streams[streamId];
        require(s.status == StreamStatus.ACTIVE, "Not active");

        uint256 elapsed = block.timestamp - s.startTime;
        uint256 consumed = elapsed * s.effectiveRate;
        require(consumed > s.depositedAmount, "Still solvent");

        uint256 insolvencyStart = s.startTime + (s.depositedAmount / s.effectiveRate);
        require(block.timestamp >= insolvencyStart + GRACE_PERIOD, "Grace period active");

        s.status = StreamStatus.TERMINATED;
        s.closedTime = insolvencyStart;

        uint256 actualConsumed = s.depositedAmount;
        usdc.safeTransfer(s.seller, actualConsumed);

        emit StreamTerminated(streamId, actualConsumed, 0);
    }
```

- [ ] **Step 4: Run ALL tests**

Run: `forge test -v`
Expected: ALL tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/StreamVault.sol test/StreamVault.t.sol
git commit -m "feat: add terminateInsolvency with grace period"
```

---

### Task 8: Event Emission Tests

**Files:**
- Modify: `test/StreamVault.t.sol`

Verify all events emit correctly — important for the frontend (reads events from ArcScan).

- [ ] **Step 1: Write event emission tests**

Add to `StreamVaultTest`:

```solidity
    function test_event_StreamOpened() public {
        vm.prank(buyer);
        vm.expectEmit(false, false, false, true);
        emit StreamVault.StreamOpened(bytes32(0), buyer, seller, RATE, 80, DEPOSIT, true);

        vault.openStream(seller, RATE, DEPOSIT, true);
    }

    function test_event_StreamClosed() public {
        vm.prank(buyer);
        bytes32 streamId = vault.openStream(seller, RATE, DEPOSIT, false);

        vm.prank(coordinator);
        vm.expectEmit(true, false, false, true);
        emit StreamVault.StreamClosed(streamId, 300_000, 700_000);

        vault.closeStream(streamId, 300_000);
    }

    function test_event_StreamToppedUp() public {
        vm.prank(buyer);
        bytes32 streamId = vault.openStream(seller, RATE, DEPOSIT, false);

        vm.prank(buyer);
        vm.expectEmit(true, false, false, true);
        emit StreamVault.StreamToppedUp(streamId, 500_000, DEPOSIT + 500_000);

        vault.topUp(streamId, 500_000);
    }

    function test_event_StreamTerminated() public {
        vm.prank(buyer);
        bytes32 streamId = vault.openStream(seller, RATE, DEPOSIT, false);

        vm.warp(block.timestamp + 10031);

        vm.expectEmit(true, false, false, true);
        emit StreamVault.StreamTerminated(streamId, DEPOSIT, 0);

        vault.terminateInsolvency(streamId);
    }
```

- [ ] **Step 2: Run event tests**

Run: `forge test --match-test "test_event" -v`
Expected: 4 passing. Note: `test_event_StreamOpened` uses `expectEmit(false,...)` for the first param because `streamId` is computed inside the function and we can't predict it exactly.

- [ ] **Step 3: Commit**

```bash
git add test/StreamVault.t.sol
git commit -m "test: add event emission tests for all StreamVault events"
```

---

### Task 9: Edge Cases + Full Suite Validation

**Files:**
- Modify: `test/StreamVault.t.sol`

- [ ] **Step 1: Write edge case tests**

Add to `StreamVaultTest`:

```solidity
    function test_isSolvent_closedStream() public {
        vm.prank(buyer);
        bytes32 streamId = vault.openStream(seller, RATE, DEPOSIT, false);

        vm.prank(coordinator);
        vault.closeStream(streamId, 0);

        assertFalse(vault.isSolvent(streamId));
    }

    function test_timeRemaining_closedStream() public {
        vm.prank(buyer);
        bytes32 streamId = vault.openStream(seller, RATE, DEPOSIT, false);

        vm.prank(coordinator);
        vault.closeStream(streamId, 0);

        assertEq(vault.timeRemaining(streamId), 0);
    }

    function test_terminateInsolvency_notActive() public {
        vm.prank(buyer);
        bytes32 streamId = vault.openStream(seller, RATE, DEPOSIT, false);

        vm.prank(coordinator);
        vault.closeStream(streamId, 0);

        vm.warp(block.timestamp + 20000);
        vm.expectRevert("Not active");
        vault.terminateInsolvency(streamId);
    }

    function test_multiple_streams() public {
        vm.startPrank(buyer);
        bytes32 id1 = vault.openStream(seller, RATE, DEPOSIT, true);
        bytes32 id2 = vault.openStream(seller, RATE, DEPOSIT, false);
        vm.stopPrank();

        assertTrue(id1 != id2);

        (,,, uint256 rate1,,,,,) = vault.streams(id1);
        (,,, uint256 rate2,,,,,) = vault.streams(id2);

        assertEq(rate1, 80);  // verified discount
        assertEq(rate2, 100); // no discount
    }

    function test_topUp_after_partial_consumption() public {
        vm.prank(buyer);
        bytes32 streamId = vault.openStream(seller, RATE, DEPOSIT, false);

        // 5000 seconds pass → consumed 500_000
        vm.warp(block.timestamp + 5000);
        assertEq(vault.timeRemaining(streamId), 5000);

        // Top up 1 USDC
        vm.prank(buyer);
        vault.topUp(streamId, DEPOSIT);

        // Remaining = (2_000_000 - 500_000) / 100 = 15000
        assertEq(vault.timeRemaining(streamId), 15000);
    }
```

- [ ] **Step 2: Run full test suite**

Run: `forge test -v`
Expected: ALL tests pass. Should be ~20+ tests total.

- [ ] **Step 3: Run with gas report**

Run: `forge test --gas-report`
Expected: Gas report shows reasonable gas costs for all functions.

- [ ] **Step 4: Commit**

```bash
git add test/StreamVault.t.sol
git commit -m "test: add edge cases and full suite validation"
```

---

### Task 10: Deploy Script

**Files:**
- Create: `script/Deploy.s.sol`

- [ ] **Step 1: Write deploy script**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Script.sol";
import "../src/StreamVault.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address usdcAddress = vm.envAddress("USDC_ADDRESS");
        address coordinatorAddress = vm.envAddress("COORDINATOR_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        StreamVault vault = new StreamVault(usdcAddress, coordinatorAddress);

        vm.stopBroadcast();

        console.log("StreamVault deployed to:", address(vault));
        console.log("USDC:", usdcAddress);
        console.log("Coordinator:", coordinatorAddress);
    }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `forge build`
Expected: `Compiler run successful`

- [ ] **Step 3: Dry-run deploy against local Anvil**

In a separate terminal, start Anvil:
```bash
anvil
```

Then run:
```bash
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
USDC_ADDRESS=0x0000000000000000000000000000000000000001 \
COORDINATOR_ADDRESS=0x0000000000000000000000000000000000000002 \
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
```

Expected: Script runs, logs deployed address. (The USDC address is a placeholder — this just verifies the script works.)

- [ ] **Step 4: Commit**

```bash
git add script/Deploy.s.sol
git commit -m "feat: add deployment script for StreamVault"
```

---

### Task 11: Final Verification + Tag

- [ ] **Step 1: Run full test suite one final time**

Run: `forge test -v --gas-report`
Expected: ALL tests pass. Gas report looks reasonable.

- [ ] **Step 2: Check contract size**

Run: `forge build --sizes`
Expected: StreamVault < 24KB (well under the limit for a ~150 line contract).

- [ ] **Step 3: Verify file structure**

```bash
ls -la src/ test/ script/ src/mocks/
```

Expected:
```
src/StreamVault.sol
src/mocks/MockUSDC.sol
test/StreamVault.t.sol
script/Deploy.s.sol
```

- [ ] **Step 4: Commit and tag**

```bash
git add -A
git commit -m "chore: phase 1A complete — StreamVault with full test coverage"
git tag v0.1.0-phase1a
```

---

## Summary

| Task | What | Tests Added |
|------|------|-------------|
| 1 | Foundry init + OpenZeppelin | — |
| 2 | MockUSDC | — |
| 3 | openStream + tiered pricing | 2 |
| 4 | isSolvent + timeRemaining | 3 |
| 5 | topUp | 4 |
| 6 | closeStream | 6 |
| 7 | terminateInsolvency | 4 |
| 8 | Event emissions | 4 |
| 9 | Edge cases | 5 |
| 10 | Deploy script | — |
| 11 | Final verification | — |
| **Total** | | **~28 tests** |
