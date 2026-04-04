// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {StreamVault} from "../src/StreamVault.sol";

contract Deploy is Script {
    function run() external {
        address usdc = vm.envAddress("USDC_ADDRESS");
        address coordinator = vm.envAddress("COORDINATOR_ADDRESS");

        vm.startBroadcast();
        StreamVault vault = new StreamVault(usdc, coordinator);
        vm.stopBroadcast();

        console.log("StreamVault deployed at:", address(vault));
        console.log("USDC:", usdc);
        console.log("Coordinator:", coordinator);
    }
}
