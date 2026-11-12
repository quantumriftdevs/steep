'use strict';
const assert = require('assert');
const {documentIntent} = require('../api/doc-intent');
module.exports = function () {
 const fixtures = [
 ['Create a PDF about gardening','pdf'], ['Make a document about cats','pdf'],
 ['Generate a DOCX proposal','docx'], ['Write a Word document','docx'],
 ['Please export this as markdown','md'], ['Save this as plain text','txt'],
 ['Export this as HTML','html'], ['Export this as CSV','csv'],
 ['I want a document','pdf'], ['I need a file','pdf'],
 ['I would like a PDF','pdf'], ["I'd like a DOCX",'docx'],
 ['Where is my file?','pdf'], ["Where's the document?",'pdf'],
 ["I don't see the file",'pdf'], ["You didn't attach the document",'pdf'],
 ['The file is missing','pdf'], ['Convert this to PDF','pdf'],
 ['Prepare a markdown file','md'], ['Create a csv file','csv'],
 ['Hello there',null], ['Tell me about PDF history',null],
 ['Do not create a document',null], ["Don't make a PDF",null],
 ['No file please',null], ['Without a document',null],
 ['I like gardening',null], ['What is a document?',null],
 ['Remind me tomorrow',null], ['The proposal looks good',null]
 ];
 for (const [text,format] of fixtures) {
  const result=documentIntent([{role:'user',content:text}]);
  assert.strictEqual(result ? result.format : null,format,text);
 }
 console.log('PASS: 30/30 doc-intent fixtures; no live model calls.');
};
