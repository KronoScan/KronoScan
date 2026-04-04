// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title StreamVault — Per-second payment streaming with verified identity pricing
/// @notice On-chain referee for StreamPay. Manages deposits, solvency, tiered pricing,
///         top-ups, auto-termination with grace period, and refunds.
contract StreamVault {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    address public coordinator;

    uint256 public constant GRACE_PERIOD = 30;
    uint256 public constant VERIFIED_DISCOUNT_BPS = 2000;
    uint256 public constant BPS_BASE = 10000;

    error OnlyCoordinator();
    error NotActive();
    error OnlyBuyer();
    error ConsumedExceedsDeposit();
    error StillSolvent();
    error GracePeriodActive();

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
        if (msg.sender != coordinator) revert OnlyCoordinator();
        _;
    }

    constructor(address _usdc, address _coordinator) {
        usdc = IERC20(_usdc);
        coordinator = _coordinator;
    }

    // --- Internal helpers ---

    function _applyDiscount(uint256 baseRate, bool verified) internal pure returns (uint256) {
        if (verified) {
            return baseRate * (BPS_BASE - VERIFIED_DISCOUNT_BPS) / BPS_BASE;
        }
        return baseRate;
    }

    function _consumed(Stream storage s) internal view returns (uint256) {
        uint256 end = s.closedTime > 0 ? s.closedTime : block.timestamp;
        uint256 elapsed = end - s.startTime;
        uint256 amount = elapsed * s.effectiveRate;
        return amount > s.depositedAmount ? s.depositedAmount : amount;
    }

    // --- Stream lifecycle ---

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

    function topUp(bytes32 streamId, uint256 amount) external {
        Stream storage s = streams[streamId];
        if (s.status != StreamStatus.ACTIVE) revert NotActive();
        if (msg.sender != s.buyer) revert OnlyBuyer();

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        s.depositedAmount += amount;

        emit StreamToppedUp(streamId, amount, s.depositedAmount);
    }

    function closeStream(bytes32 streamId, uint256 actualConsumed) external onlyCoordinator {
        Stream storage s = streams[streamId];
        if (s.status != StreamStatus.ACTIVE) revert NotActive();
        if (actualConsumed > s.depositedAmount) revert ConsumedExceedsDeposit();

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

    function terminateInsolvency(bytes32 streamId) external {
        Stream storage s = streams[streamId];
        if (s.status != StreamStatus.ACTIVE) revert NotActive();

        uint256 elapsed = block.timestamp - s.startTime;
        uint256 consumed = elapsed * s.effectiveRate;
        if (consumed <= s.depositedAmount) revert StillSolvent();

        uint256 insolvencyStart = s.startTime + (s.depositedAmount / s.effectiveRate);
        if (block.timestamp < insolvencyStart + GRACE_PERIOD) revert GracePeriodActive();

        s.status = StreamStatus.TERMINATED;
        s.closedTime = insolvencyStart;

        uint256 actualConsumed = s.depositedAmount;
        usdc.safeTransfer(s.seller, actualConsumed);

        emit StreamTerminated(streamId, actualConsumed, 0);
    }

    // --- View functions ---

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
}
