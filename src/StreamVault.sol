// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title StreamVault — On-chain escrow for per-request AI agent payments
/// @notice Manages deposits, identity-conditioned pricing, consumption tracking,
///         top-ups, session timeout, and automatic refunds.
contract StreamVault {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    address public coordinator;

    uint256 public constant MAX_SESSION_DURATION = 3600; // 1 hour max
    uint256 public constant VERIFIED_DISCOUNT_BPS = 2000;
    uint256 public constant BPS_BASE = 10000;

    error OnlyCoordinator();
    error NotActive();
    error OnlyBuyer();
    error ConsumedExceedsDeposit();
    error SessionNotExpired();

    enum SessionStatus { ACTIVE, CLOSED, TERMINATED }

    struct Session {
        address buyer;
        address seller;
        uint256 pricePerRequest;
        uint256 effectivePrice;
        uint256 depositedAmount;
        uint256 consumedAmount;
        uint256 startTime;
        uint256 closedTime;
        SessionStatus status;
        bool buyerVerified;
    }

    mapping(bytes32 => Session) public sessions;
    uint256 public sessionCount;

    event SessionOpened(
        bytes32 indexed sessionId, address buyer, address seller,
        uint256 pricePerRequest, uint256 effectivePrice, uint256 deposit, bool verified
    );
    event ConsumptionReported(bytes32 indexed sessionId, uint256 amount, uint256 newTotal);
    event SessionClosed(bytes32 indexed sessionId, uint256 consumed, uint256 refunded);
    event SessionTerminated(bytes32 indexed sessionId, uint256 consumed, uint256 refunded);
    event SessionToppedUp(bytes32 indexed sessionId, uint256 amount, uint256 newTotal);

    modifier onlyCoordinator() {
        if (msg.sender != coordinator) revert OnlyCoordinator();
        _;
    }

    constructor(address _usdc, address _coordinator) {
        usdc = IERC20(_usdc);
        coordinator = _coordinator;
    }

    // --- Internal helpers ---

    function _applyDiscount(uint256 basePrice, bool verified) internal pure returns (uint256) {
        if (verified) {
            return basePrice * (BPS_BASE - VERIFIED_DISCOUNT_BPS) / BPS_BASE;
        }
        return basePrice;
    }

    // --- Session lifecycle ---

    function openSession(
        address seller,
        uint256 pricePerRequest,
        uint256 deposit,
        bool worldIdVerified
    ) external returns (bytes32 sessionId) {
        usdc.safeTransferFrom(msg.sender, address(this), deposit);

        uint256 effectivePrice = _applyDiscount(pricePerRequest, worldIdVerified);
        sessionId = keccak256(abi.encodePacked(msg.sender, seller, block.timestamp, sessionCount++));

        sessions[sessionId] = Session({
            buyer: msg.sender,
            seller: seller,
            pricePerRequest: pricePerRequest,
            effectivePrice: effectivePrice,
            depositedAmount: deposit,
            consumedAmount: 0,
            startTime: block.timestamp,
            closedTime: 0,
            status: SessionStatus.ACTIVE,
            buyerVerified: worldIdVerified
        });

        emit SessionOpened(sessionId, msg.sender, seller, pricePerRequest, effectivePrice, deposit, worldIdVerified);
    }

    function topUp(bytes32 sessionId, uint256 amount) external {
        Session storage s = sessions[sessionId];
        if (s.status != SessionStatus.ACTIVE) revert NotActive();
        if (msg.sender != s.buyer) revert OnlyBuyer();

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        s.depositedAmount += amount;

        emit SessionToppedUp(sessionId, amount, s.depositedAmount);
    }

    /// @notice Coordinator reports consumption after each x402 payment
    function reportConsumption(bytes32 sessionId, uint256 amount) external onlyCoordinator {
        Session storage s = sessions[sessionId];
        if (s.status != SessionStatus.ACTIVE) revert NotActive();
        s.consumedAmount += amount;
        if (s.consumedAmount > s.depositedAmount) revert ConsumedExceedsDeposit();

        emit ConsumptionReported(sessionId, amount, s.consumedAmount);
    }

    function closeSession(bytes32 sessionId) external onlyCoordinator {
        Session storage s = sessions[sessionId];
        if (s.status != SessionStatus.ACTIVE) revert NotActive();

        s.status = SessionStatus.CLOSED;
        s.closedTime = block.timestamp;

        uint256 consumed = s.consumedAmount;
        uint256 refund = s.depositedAmount - consumed;
        if (refund > 0) {
            usdc.safeTransfer(s.buyer, refund);
        }
        if (consumed > 0) {
            usdc.safeTransfer(s.seller, consumed);
        }

        emit SessionClosed(sessionId, consumed, refund);
    }

    /// @notice Anyone can terminate an expired session (safety net for coordinator failure)
    function terminateExpired(bytes32 sessionId) external {
        Session storage s = sessions[sessionId];
        if (s.status != SessionStatus.ACTIVE) revert NotActive();
        if (block.timestamp < s.startTime + MAX_SESSION_DURATION) revert SessionNotExpired();

        s.status = SessionStatus.TERMINATED;
        s.closedTime = block.timestamp;

        uint256 consumed = s.consumedAmount;
        uint256 refund = s.depositedAmount - consumed;
        if (consumed > 0) {
            usdc.safeTransfer(s.seller, consumed);
        }
        if (refund > 0) {
            usdc.safeTransfer(s.buyer, refund);
        }

        emit SessionTerminated(sessionId, consumed, refund);
    }

    // --- View functions ---

    function isSolvent(bytes32 sessionId) external view returns (bool) {
        Session storage s = sessions[sessionId];
        if (s.status != SessionStatus.ACTIVE) return false;
        return s.consumedAmount < s.depositedAmount;
    }

    /// @notice Returns how many more requests the session can afford
    function requestsRemaining(bytes32 sessionId) external view returns (uint256) {
        Session storage s = sessions[sessionId];
        if (s.status != SessionStatus.ACTIVE) return 0;
        if (s.consumedAmount >= s.depositedAmount) return 0;
        return (s.depositedAmount - s.consumedAmount) / s.effectivePrice;
    }
}
