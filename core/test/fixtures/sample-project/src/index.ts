import { utilA } from '@/utils/a';
import { Button } from '@components/Button';
import { b } from './barrel';
const cjs = require('./cjsModule');

// dynamic import flagged as TODO
const dynamicPromise = import('./dynamicTarget');

// external package - should be skipped
import React from 'react';

export const main = () => {
  return `${utilA}-${b}`;
};
