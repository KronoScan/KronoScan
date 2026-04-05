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

    uint256 public constant PRICE = 100; // $0.0001/request
    uint256 public constant DEPOSIT = 1_000_000; // 1 USDC

    function setUp() public {
        usdc = new MockUSDC();
        vault = new StreamVault(address(usdc), coordinator);

        usdc.mint(buyer, 10_000_000); // 10 USDC
        vm.prank(buyer);
        usdc.approve(address(vault), type(uint256).max);
    }

    // ==================== openSession ====================

    function test_openSession_verified() public {
        vm.prank(buyer);
        bytes32 sessionId = vault.openSession(seller, PRICE, DEPOSIT, true);

        (
            address sBuyer,
            address sSeller,
            uint256 sPricePerRequest,
            uint256 sEffectivePrice,
            uint256 sDeposit,
            uint256 sConsumed,
            uint256 sStartTime,
            uint256 sClosedTime,
            StreamVault.SessionStatus sStatus,
            bool sVerified
        ) = vault.sessions(sessionId);

        assertEq(sBuyer, buyer);
        assertEq(sSeller, seller);
        assertEq(sPricePerRequest, PRICE);
        assertEq(sEffectivePrice, 80); // 20% discount: 100 * 8000 / 10000
        assertEq(sDeposit, DEPOSIT);
        assertEq(sConsumed, 0);
        assertEq(sStartTime, block.timestamp);
        assertEq(sClosedTime, 0);
        assertEq(uint8(sStatus), uint8(StreamVault.SessionStatus.ACTIVE));
        assertTrue(sVerified);

        assertEq(usdc.balanceOf(address(vault)), DEPOSIT);
        assertEq(usdc.balanceOf(buyer), 10_000_000 - DEPOSIT);
    }

    function test_openSession_unverified() public {
        vm.prank(buyer);
        bytes32 sessionId = vault.openSession(seller, PRICE, DEPOSIT, false);

        (,, uint256 sPricePerRequest, uint256 sEffectivePrice,,,,,, bool sVerified) = vault.sessions(sessionId);

        assertEq(sPricePerRequest, PRICE);
        assertEq(sEffectivePrice, PRICE); // no discount
        assertFalse(sVerified);
    }

    // ==================== reportConsumption ====================

    function test_reportConsumption() public {
        vm.prank(buyer);
        bytes32 sessionId = vault.openSession(seller, PRICE, DEPOSIT, true);

        vm.prank(coordinator);
        vault.reportConsumption(sessionId, 80);

        (,,,,, uint256 sConsumed,,,,) = vault.sessions(sessionId);
        assertEq(sConsumed, 80);

        // Report again
        vm.prank(coordinator);
        vault.reportConsumption(sessionId, 80);

        (,,,,, uint256 sConsumed2,,,,) = vault.sessions(sessionId);
        assertEq(sConsumed2, 160);
    }

    function test_reportConsumption_onlyCoordinator() public {
        vm.prank(buyer);
        bytes32 sessionId = vault.openSession(seller, PRICE, DEPOSIT, false);

        vm.prank(buyer);
        vm.expectRevert(StreamVault.OnlyCoordinator.selector);
        vault.reportConsumption(sessionId, 100);
    }

    function test_reportConsumption_exceedsDeposit() public {
        vm.prank(buyer);
        bytes32 sessionId = vault.openSession(seller, PRICE, DEPOSIT, false);

        vm.prank(coordinator);
        vm.expectRevert(StreamVault.ConsumedExceedsDeposit.selector);
        vault.reportConsumption(sessionId, DEPOSIT + 1);
    }

    function test_reportConsumption_notActive() public {
        vm.prank(buyer);
        bytes32 sessionId = vault.openSession(seller, PRICE, DEPOSIT, false);

        vm.prank(coordinator);
        vault.closeSession(sessionId);

        vm.prank(coordinator);
        vm.expectRevert(StreamVault.NotActive.selector);
        vault.reportConsumption(sessionId, 100);
    }

    // ==================== isSolvent ====================

    function test_isSolvent_activeSession() public {
        vm.prank(buyer);
        bytes32 sessionId = vault.openSession(seller, PRICE, DEPOSIT, false);

        assertTrue(vault.isSolvent(sessionId));
    }

    function test_isSolvent_afterConsumption() public {
        vm.prank(buyer);
        bytes32 sessionId = vault.openSession(seller, PRICE, DEPOSIT, false);

        // Consume half
        vm.prank(coordinator);
        vault.reportConsumption(sessionId, 500_000);
        assertTrue(vault.isSolvent(sessionId));

        // Consume rest
        vm.prank(coordinator);
        vault.reportConsumption(sessionId, 500_000);
        assertFalse(vault.isSolvent(sessionId));
    }

    function test_isSolvent_closedSession() public {
        vm.prank(buyer);
        bytes32 sessionId = vault.openSession(seller, PRICE, DEPOSIT, false);

        vm.prank(coordinator);
        vault.closeSession(sessionId);

        assertFalse(vault.isSolvent(sessionId));
    }

    // ==================== requestsRemaining ====================

    function test_requestsRemaining() public {
        vm.prank(buyer);
        bytes32 sessionId = vault.openSession(seller, PRICE, DEPOSIT, false);

        // 1_000_000 / 100 = 10000 requests
        assertEq(vault.requestsRemaining(sessionId), 10000);
    }

    function test_requestsRemaining_verified() public {
        vm.prank(buyer);
        bytes32 sessionId = vault.openSession(seller, PRICE, DEPOSIT, true);

        // effectivePrice = 80, so 1_000_000 / 80 = 12500 requests
        assertEq(vault.requestsRemaining(sessionId), 12500);
    }

    function test_requestsRemaining_afterConsumption() public {
        vm.prank(buyer);
        bytes32 sessionId = vault.openSession(seller, PRICE, DEPOSIT, false);

        vm.prank(coordinator);
        vault.reportConsumption(sessionId, 300_000);

        // (1_000_000 - 300_000) / 100 = 7000
        assertEq(vault.requestsRemaining(sessionId), 7000);
    }

    function test_requestsRemaining_closedSession() public {
        vm.prank(buyer);
        bytes32 sessionId = vault.openSession(seller, PRICE, DEPOSIT, false);

        vm.prank(coordinator);
        vault.closeSession(sessionId);

        assertEq(vault.requestsRemaining(sessionId), 0);
    }

    // ==================== topUp ====================

    function test_topUp() public {
        vm.prank(buyer);
        bytes32 sessionId = vault.openSession(seller, PRICE, DEPOSIT, false);

        uint256 topUpAmount = 500_000;

        vm.prank(buyer);
        vault.topUp(sessionId, topUpAmount);

        (,,,, uint256 sDeposit,,,,, ) = vault.sessions(sessionId);
        assertEq(sDeposit, DEPOSIT + topUpAmount);
        assertEq(usdc.balanceOf(address(vault)), DEPOSIT + topUpAmount);
    }

    function test_topUp_extendsRequests() public {
        vm.prank(buyer);
        bytes32 sessionId = vault.openSession(seller, PRICE, DEPOSIT, false);

        assertEq(vault.requestsRemaining(sessionId), 10000);

        vm.prank(buyer);
        vault.topUp(sessionId, DEPOSIT); // double deposit

        assertEq(vault.requestsRemaining(sessionId), 20000);
    }

    function test_topUp_afterPartialConsumption() public {
        vm.prank(buyer);
        bytes32 sessionId = vault.openSession(seller, PRICE, DEPOSIT, false);

        // Consume 500_000
        vm.prank(coordinator);
        vault.reportConsumption(sessionId, 500_000);
        assertEq(vault.requestsRemaining(sessionId), 5000);

        // Top up 1 USDC
        vm.prank(buyer);
        vault.topUp(sessionId, DEPOSIT);

        // (2_000_000 - 500_000) / 100 = 15000
        assertEq(vault.requestsRemaining(sessionId), 15000);
    }

    function test_topUp_onlyBuyer() public {
        vm.prank(buyer);
        bytes32 sessionId = vault.openSession(seller, PRICE, DEPOSIT, false);

        vm.prank(seller);
        vm.expectRevert(StreamVault.OnlyBuyer.selector);
        vault.topUp(sessionId, 500_000);
    }

    function test_topUp_onlyActive() public {
        vm.prank(buyer);
        bytes32 sessionId = vault.openSession(seller, PRICE, DEPOSIT, false);

        vm.prank(coordinator);
        vault.closeSession(sessionId);

        vm.prank(buyer);
        vm.expectRevert(StreamVault.NotActive.selector);
        vault.topUp(sessionId, 500_000);
    }

    // ==================== closeSession ====================

    function test_closeSession_partialConsumption() public {
        vm.prank(buyer);
        bytes32 sessionId = vault.openSession(seller, PRICE, DEPOSIT, false);

        uint256 consumed = 300_000;
        vm.prank(coordinator);
        vault.reportConsumption(sessionId, consumed);

        uint256 buyerBefore = usdc.balanceOf(buyer);
        uint256 sellerBefore = usdc.balanceOf(seller);

        vm.prank(coordinator);
        vault.closeSession(sessionId);

        assertEq(usdc.balanceOf(seller), sellerBefore + consumed);
        assertEq(usdc.balanceOf(buyer), buyerBefore + (DEPOSIT - consumed));
        assertEq(usdc.balanceOf(address(vault)), 0);

        (,,,,,,, uint256 sClosedTime, StreamVault.SessionStatus sStatus,) = vault.sessions(sessionId);
        assertEq(uint8(sStatus), uint8(StreamVault.SessionStatus.CLOSED));
        assertGt(sClosedTime, 0);
    }

    function test_closeSession_fullConsumption() public {
        vm.prank(buyer);
        bytes32 sessionId = vault.openSession(seller, PRICE, DEPOSIT, false);

        vm.prank(coordinator);
        vault.reportConsumption(sessionId, DEPOSIT);

        vm.prank(coordinator);
        vault.closeSession(sessionId);

        assertEq(usdc.balanceOf(seller), DEPOSIT);
        assertEq(usdc.balanceOf(address(vault)), 0);
    }

    function test_closeSession_zeroConsumption() public {
        vm.prank(buyer);
        bytes32 sessionId = vault.openSession(seller, PRICE, DEPOSIT, false);

        uint256 buyerBefore = usdc.balanceOf(buyer);

        vm.prank(coordinator);
        vault.closeSession(sessionId);

        assertEq(usdc.balanceOf(buyer), buyerBefore + DEPOSIT);
        assertEq(usdc.balanceOf(seller), 0);
    }

    function test_closeSession_onlyCoordinator() public {
        vm.prank(buyer);
        bytes32 sessionId = vault.openSession(seller, PRICE, DEPOSIT, false);

        vm.prank(buyer);
        vm.expectRevert(StreamVault.OnlyCoordinator.selector);
        vault.closeSession(sessionId);
    }

    function test_closeSession_notActive() public {
        vm.prank(buyer);
        bytes32 sessionId = vault.openSession(seller, PRICE, DEPOSIT, false);

        vm.prank(coordinator);
        vault.closeSession(sessionId);

        vm.prank(coordinator);
        vm.expectRevert(StreamVault.NotActive.selector);
        vault.closeSession(sessionId);
    }

    // ==================== terminateExpired ====================

    function test_terminateExpired() public {
        vm.prank(buyer);
        bytes32 sessionId = vault.openSession(seller, PRICE, DEPOSIT, false);

        // Warp past MAX_SESSION_DURATION (3600s)
        vm.warp(block.timestamp + 3601);

        uint256 buyerBefore = usdc.balanceOf(buyer);

        address anyone = makeAddr("anyone");
        vm.prank(anyone);
        vault.terminateExpired(sessionId);

        // Zero consumed → full refund to buyer
        assertEq(usdc.balanceOf(buyer), buyerBefore + DEPOSIT);
        assertEq(usdc.balanceOf(seller), 0);
        assertEq(usdc.balanceOf(address(vault)), 0);

        (,,,,,,, uint256 sClosedTime, StreamVault.SessionStatus sStatus,) = vault.sessions(sessionId);
        assertEq(uint8(sStatus), uint8(StreamVault.SessionStatus.TERMINATED));
        assertGt(sClosedTime, 0);
    }

    function test_terminateExpired_withConsumption() public {
        vm.prank(buyer);
        bytes32 sessionId = vault.openSession(seller, PRICE, DEPOSIT, false);

        // Report some consumption
        uint256 consumed = 400_000;
        vm.prank(coordinator);
        vault.reportConsumption(sessionId, consumed);

        // Warp past MAX_SESSION_DURATION
        vm.warp(block.timestamp + 3601);

        uint256 buyerBefore = usdc.balanceOf(buyer);
        uint256 sellerBefore = usdc.balanceOf(seller);

        vault.terminateExpired(sessionId);

        assertEq(usdc.balanceOf(seller), sellerBefore + consumed);
        assertEq(usdc.balanceOf(buyer), buyerBefore + (DEPOSIT - consumed));
        assertEq(usdc.balanceOf(address(vault)), 0);
    }

    function test_terminateExpired_sessionNotExpired() public {
        vm.prank(buyer);
        bytes32 sessionId = vault.openSession(seller, PRICE, DEPOSIT, false);

        vm.warp(block.timestamp + 1800); // only 30 min, not 1 hour

        vm.expectRevert(StreamVault.SessionNotExpired.selector);
        vault.terminateExpired(sessionId);
    }

    function test_terminateExpired_notActive() public {
        vm.prank(buyer);
        bytes32 sessionId = vault.openSession(seller, PRICE, DEPOSIT, false);

        vm.prank(coordinator);
        vault.closeSession(sessionId);

        vm.warp(block.timestamp + 3601);
        vm.expectRevert(StreamVault.NotActive.selector);
        vault.terminateExpired(sessionId);
    }

    // ==================== Events ====================

    function test_event_SessionOpened() public {
        vm.prank(buyer);
        vm.expectEmit(false, false, false, true);
        emit StreamVault.SessionOpened(bytes32(0), buyer, seller, PRICE, 80, DEPOSIT, true);

        vault.openSession(seller, PRICE, DEPOSIT, true);
    }

    function test_event_ConsumptionReported() public {
        vm.prank(buyer);
        bytes32 sessionId = vault.openSession(seller, PRICE, DEPOSIT, false);

        vm.prank(coordinator);
        vm.expectEmit(true, false, false, true);
        emit StreamVault.ConsumptionReported(sessionId, 100, 100);

        vault.reportConsumption(sessionId, 100);
    }

    function test_event_SessionClosed() public {
        vm.prank(buyer);
        bytes32 sessionId = vault.openSession(seller, PRICE, DEPOSIT, false);

        vm.prank(coordinator);
        vault.reportConsumption(sessionId, 300_000);

        vm.prank(coordinator);
        vm.expectEmit(true, false, false, true);
        emit StreamVault.SessionClosed(sessionId, 300_000, 700_000);

        vault.closeSession(sessionId);
    }

    function test_event_SessionToppedUp() public {
        vm.prank(buyer);
        bytes32 sessionId = vault.openSession(seller, PRICE, DEPOSIT, false);

        vm.prank(buyer);
        vm.expectEmit(true, false, false, true);
        emit StreamVault.SessionToppedUp(sessionId, 500_000, DEPOSIT + 500_000);

        vault.topUp(sessionId, 500_000);
    }

    function test_event_SessionTerminated() public {
        vm.prank(buyer);
        bytes32 sessionId = vault.openSession(seller, PRICE, DEPOSIT, false);

        vm.prank(coordinator);
        vault.reportConsumption(sessionId, DEPOSIT);

        vm.warp(block.timestamp + 3601);

        vm.expectEmit(true, false, false, true);
        emit StreamVault.SessionTerminated(sessionId, DEPOSIT, 0);

        vault.terminateExpired(sessionId);
    }

    // ==================== Multiple sessions ====================

    function test_multipleSessions() public {
        vm.startPrank(buyer);
        bytes32 id1 = vault.openSession(seller, PRICE, DEPOSIT, true);
        bytes32 id2 = vault.openSession(seller, PRICE, DEPOSIT, false);
        vm.stopPrank();

        assertTrue(id1 != id2);

        (,,, uint256 price1,,,,,,) = vault.sessions(id1);
        (,,, uint256 price2,,,,,,) = vault.sessions(id2);

        assertEq(price1, 80);  // verified discount
        assertEq(price2, 100); // no discount
    }
}
