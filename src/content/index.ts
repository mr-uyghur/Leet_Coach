// Content script entry point — runs on leetcode.com/problems/*
import { injectPageScript } from './injector'
import { initBridge } from './bridge'

injectPageScript()
initBridge()
