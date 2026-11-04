[**unifi-protect**](../README.md)

***

[Home](../README.md) / formatErrorChain

# Function: formatErrorChain()

```ts
function formatErrorChain(error): string;
```

Render an arbitrary thrown value as clean text, carrying every further diagnosis its `cause` chain holds. An `Error` surfaces its `message`; anything else is
coerced through `String(...)`.

A wrapped failure presents its diagnosis below the sentence that was caught: a [ProtectBootstrapError](../classes/ProtectBootstrapError.md) wraps the transport's classified failure, and a
socket's [ProtectNetworkError](../classes/ProtectNetworkError.md) wraps the platform's own error, so a reader that takes the top message alone drops exactly the part an operator needs. This
follows the `cause` chain down and appends each further message after a colon. The following rules decide what it appends:

1. Only an `Error` link contributes text. A cause that is a plain object is structured context for code to read - a code, a status, a response body - so
   rendering it would print `[object Object]` at best and a secret at worst. Such a link contributes nothing and the descent continues below it, which is what
   lets an error sitting under one still be rendered.
2. A link whose words the text so far already carries contributes nothing. A wrapper that builds its own message around its cause therefore names that cause
   once rather than twice, and a rendering nested inside another stays stable.
3. One terminal period is removed from every message taken, the top one included, so the text carries none of its own and the sentence that embeds it supplies
   the period.
4. The descent is bounded, which is also what ends a chain that refers back to itself: such a chain repeats messages the text already holds, so rule 2 appends
   nothing and the bound stops the walk.

The library takes no runtime dependency on homebridge-plugin-utils, so the rule its `formatErrorMessage` states is implemented here as well. A differential test
feeds a table of error shapes through both and asserts equal output, which is what keeps the two of them one rule. Every place the library renders an error for
a person reads this, so a consumer reading a connection transition's reason sees the words the lost line logged.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `error` | `unknown` | The thrown value. Typed `unknown` because catch bindings, event handlers, and rejected promises all deliver untyped values. |

## Returns

`string`

The rendered text, carrying each further diagnosis the cause chain held and no terminal period of its own.
