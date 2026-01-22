<script lang="ts">
  const items = $state([1, 2, 3]);
</script>

<div>
    {#each items as item}
        <p>{item}</p>
    {/each}
</div>
