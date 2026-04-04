// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {StreamVault} from "../src/StreamVault.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

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

    // ==================== openStream ====================

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
        assertEq(sEffectiveRate, 80); // 20% discount: 100 * 8000 / 10000
        assertEq(sDeposit, DEPOSIT);
        assertEq(sStartTime, block.timestamp);
        assertEq(sClosedTime, 0);
        assertEq(uint8(sStatus), uint8(StreamVault.StreamStatus.ACTIVE));
        assertTrue(sVerified);

        assertEq(usdc.balanceOf(address(vault)), DEPOSIT);
        assertEq(usdc.balanceOf(buyer), 10_000_000 - DEPOSIT);
    }

    function test_openStream_unverified() public {
        vm.prank(buyer);
        bytes32 streamId = vault.openStream(seller, RATE, DEPOSIT, false);

        (,, uint256 sBaseRate, uint256 sEffectiveRate,,,,, bool sVerified) = vault.streams(streamId);

        assertEq(sBaseRate, RATE);
        assertEq(sEffectiveRate, RATE); // no discount
        assertFalse(sVerified);
    }

    // ==================== isSolvent ====================

    function test_isSolvent_active_stream() public {
        vm.prank(buyer);
        bytes32 streamId = vault.openStream(seller, RATE, DEPOSIT, false);

        assertTrue(vault.isSolvent(streamId));

        // After 5000s at rate 100: consumed = 500_000 < 1_000_000
        vm.warp(block.timestamp + 5000);
        assertTrue(vault.isSolvent(streamId));

        // After 10000s: consumed = 1_000_000 = deposit (at limit)
        vm.warp(block.timestamp + 5000);
        assertFalse(vault.isSolvent(streamId));
    }

    function test_isSolvent_verified_lasts_longer() public {
        vm.prank(buyer);
        bytes32 streamId = vault.openStream(seller, RATE, DEPOSIT, true);

        // Effective rate = 80, so 1_000_000 / 80 = 12500s
        vm.warp(block.timestamp + 12000);
        assertTrue(vault.isSolvent(streamId));

        vm.warp(block.timestamp + 500);
        assertFalse(vault.isSolvent(streamId));
    }

    function test_isSolvent_closedStream() public {
        vm.prank(buyer);
        bytes32 streamId = vault.openStream(seller, RATE, DEPOSIT, false);

        vm.prank(coordinator);
        vault.closeStream(streamId, 0);

        assertFalse(vault.isSolvent(streamId));
    }

    // ==================== timeRemaining ====================

    function test_timeRemaining() public {
        vm.prank(buyer);
        bytes32 streamId = vault.openStream(seller, RATE, DEPOSIT, false);

        // At start: 1_000_000 / 100 = 10000s
        assertEq(vault.timeRemaining(streamId), 10000);

        // After 3000s: (1_000_000 - 300_000) / 100 = 7000
        vm.warp(block.timestamp + 3000);
        assertEq(vault.timeRemaining(streamId), 7000);

        // After insolvency: 0
        vm.warp(block.timestamp + 8000);
        assertEq(vault.timeRemaining(streamId), 0);
    }

    function test_timeRemaining_closedStream() public {
        vm.prank(buyer);
        bytes32 streamId = vault.openStream(seller, RATE, DEPOSIT, false);

        vm.prank(coordinator);
        vault.closeStream(streamId, 0);

        assertEq(vault.timeRemaining(streamId), 0);
    }

    // ==================== topUp ====================

    function test_topUp() public {
        vm.prank(buyer);
        bytes32 streamId = vault.openStream(seller, RATE, DEPOSIT, false);

        uint256 topUpAmount = 500_000;

        vm.prank(buyer);
        vault.topUp(streamId, topUpAmount);

        (,,,, uint256 sDeposit,,,,) = vault.streams(streamId);
        assertEq(sDeposit, DEPOSIT + topUpAmount);
        assertEq(usdc.balanceOf(address(vault)), DEPOSIT + topUpAmount);
    }

    function test_topUp_extends_time() public {
        vm.prank(buyer);
        bytes32 streamId = vault.openStream(seller, RATE, DEPOSIT, false);

        assertEq(vault.timeRemaining(streamId), 10000);

        vm.prank(buyer);
        vault.topUp(streamId, DEPOSIT); // double deposit

        assertEq(vault.timeRemaining(streamId), 20000);
    }

    function test_topUp_after_partial_consumption() public {
        vm.prank(buyer);
        bytes32 streamId = vault.openStream(seller, RATE, DEPOSIT, false);

        // 5000s pass → consumed 500_000
        vm.warp(block.timestamp + 5000);
        assertEq(vault.timeRemaining(streamId), 5000);

        // Top up 1 USDC
        vm.prank(buyer);
        vault.topUp(streamId, DEPOSIT);

        // Remaining = (2_000_000 - 500_000) / 100 = 15000
        assertEq(vault.timeRemaining(streamId), 15000);
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

        vm.prank(coordinator);
        vault.closeStream(streamId, 0);

        vm.prank(buyer);
        vm.expectRevert("Not active");
        vault.topUp(streamId, 500_000);
    }

    // ==================== closeStream ====================

    function test_closeStream_partial() public {
        vm.prank(buyer);
        bytes32 streamId = vault.openStream(seller, RATE, DEPOSIT, false);

        uint256 consumed = 300_000;
        uint256 buyerBefore = usdc.balanceOf(buyer);
        uint256 sellerBefore = usdc.balanceOf(seller);

        vm.prank(coordinator);
        vault.closeStream(streamId, consumed);

        assertEq(usdc.balanceOf(seller), sellerBefore + consumed);
        assertEq(usdc.balanceOf(buyer), buyerBefore + (DEPOSIT - consumed));
        assertEq(usdc.balanceOf(address(vault)), 0);

        (,,,,,, uint256 sClosedTime, StreamVault.StreamStatus sStatus,) = vault.streams(streamId);
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

        vm.prank(coordinator);
        vm.expectRevert("Not active");
        vault.closeStream(streamId, 0);
    }

    // ==================== terminateInsolvency ====================

    function test_terminateInsolvency() public {
        vm.prank(buyer);
        bytes32 streamId = vault.openStream(seller, RATE, DEPOSIT, false);

        // Rate=100, deposit=1_000_000 → insolvency at 10000s
        // Grace period = 30s → terminable at 10030s
        vm.warp(block.timestamp + 10031);

        uint256 sellerBefore = usdc.balanceOf(seller);

        address anyone = makeAddr("anyone");
        vm.prank(anyone);
        vault.terminateInsolvency(streamId);

        assertEq(usdc.balanceOf(seller), sellerBefore + DEPOSIT);
        assertEq(usdc.balanceOf(address(vault)), 0);

        (,,,,,, uint256 sClosedTime, StreamVault.StreamStatus sStatus,) = vault.streams(streamId);
        assertEq(uint8(sStatus), uint8(StreamVault.StreamStatus.TERMINATED));
        // closedTime at insolvency point, not call time
        assertEq(sClosedTime, 1 + 10000); // block.timestamp starts at 1 in Foundry
    }

    function test_terminateInsolvency_stillSolvent() public {
        vm.prank(buyer);
        bytes32 streamId = vault.openStream(seller, RATE, DEPOSIT, false);

        vm.warp(block.timestamp + 5000);

        vm.expectRevert("Still solvent");
        vault.terminateInsolvency(streamId);
    }

    function test_terminateInsolvency_gracePeriodActive() public {
        vm.prank(buyer);
        bytes32 streamId = vault.openStream(seller, RATE, DEPOSIT, false);

        vm.warp(block.timestamp + 10015); // insolvent but within grace

        vm.expectRevert("Grace period active");
        vault.terminateInsolvency(streamId);
    }

    function test_terminateInsolvency_verified_timing() public {
        vm.prank(buyer);
        bytes32 streamId = vault.openStream(seller, RATE, DEPOSIT, true);

        // Effective rate = 80 → insolvency at 1_000_000/80 = 12500s
        vm.warp(block.timestamp + 12500);

        vm.expectRevert("Still solvent");
        vault.terminateInsolvency(streamId);

        vm.warp(block.timestamp + 31); // past grace
        vault.terminateInsolvency(streamId);

        (,,,,,,, StreamVault.StreamStatus sStatus,) = vault.streams(streamId);
        assertEq(uint8(sStatus), uint8(StreamVault.StreamStatus.TERMINATED));
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

    // ==================== Events ====================

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

    // ==================== Multiple streams ====================

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
}
