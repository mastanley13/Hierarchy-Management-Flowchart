// Diagnostic script to analyze upline relationships
// Run with: node scripts/analyze-uplines.js

async function analyzeUplines() {
  try {
    console.log('🔍 Fetching snapshot data...\n');
    const response = await fetch('http://localhost:3000/api/ghl/snapshot');
    const snapshot = await response.json();

    if (!snapshot || !snapshot.hierarchy) {
      console.error('❌ No snapshot data found');
      return;
    }

    console.log('📊 SNAPSHOT STATISTICS');
    console.log('====================');
    console.log(`Total contacts: ${snapshot.stats.producers}`);
    console.log(`Total branches: ${snapshot.stats.branches}`);
    console.log(`Generated at: ${snapshot.generatedAt}\n`);

    // Flatten all nodes for analysis
    const allNodes = [];
    const flattenNodes = (nodes) => {
      nodes.forEach(node => {
        allNodes.push(node);
        if (node.children && node.children.length > 0) {
          flattenNodes(node.children);
        }
      });
    };
    flattenNodes(snapshot.hierarchy);

    console.log('📈 HIERARCHY STRUCTURE ANALYSIS');
    console.log('================================');
    console.log(`Total nodes in hierarchy: ${allNodes.length}`);
    console.log(`Root nodes (top level): ${snapshot.hierarchy.length}`);

    // Calculate depth distribution
    const depthMap = new Map();
    const calculateDepth = (node, depth = 0) => {
      if (!depthMap.has(depth)) {
        depthMap.set(depth, []);
      }
      depthMap.get(depth).push(node);
      
      if (node.children && node.children.length > 0) {
        node.children.forEach(child => calculateDepth(child, depth + 1));
      }
    };

    snapshot.hierarchy.forEach(root => calculateDepth(root, 0));

    console.log('\n📊 DEPTH DISTRIBUTION:');
    depthMap.forEach((nodes, depth) => {
      console.log(`  Level ${depth}: ${nodes.length} nodes`);
    });

    const maxDepth = Math.max(...Array.from(depthMap.keys()));
    console.log(`\nMax depth: ${maxDepth}`);

    // Analyze upline relationships
    console.log('\n🔗 UPLINE RELATIONSHIP ANALYSIS');
    console.log('=================================');

    // Count upline sources
    const uplineSourceCounts = {
      npn: 0,
      surelc: 0,
      email: 0,
      unknown: 0,
    };

    const uplineMatches = [];
    const uplineNoMatches = [];

    allNodes.forEach(node => {
      if (node.uplineSource && node.uplineSource !== 'unknown') {
        uplineSourceCounts[node.uplineSource]++;
        
        // Find parent node
        const findParent = (nodes, targetId) => {
          for (const n of nodes) {
            if (n.id === targetId) return n;
            if (n.children) {
              const found = findParent(n.children, targetId);
              if (found) return found;
            }
          }
          return null;
        };

        const parent = snapshot.hierarchy.find(root => {
          const found = findParent([root], node.id);
          return found && found !== node;
        });

        if (parent || node.level > 0) {
          uplineMatches.push({
            contact: node.label,
            npn: node.npn,
            uplineSource: node.uplineSource,
            uplineProducerId: node.raw?.uplineProducerId,
            uplineEmail: node.raw?.uplineEmail,
            level: node.level,
            hasParent: node.level > 0,
          });
        }
      } else {
        if (node.raw?.uplineProducerId || node.raw?.uplineEmail) {
          uplineNoMatches.push({
            contact: node.label,
            npn: node.npn,
            uplineProducerId: node.raw?.uplineProducerId,
            uplineEmail: node.raw?.uplineEmail,
            reason: node.issues?.uplineNotFound ? 'Upline not found' : 'Unknown source',
          });
        }
      }
    });

    console.log('\n📊 UPLINE SOURCE BREAKDOWN:');
    Object.entries(uplineSourceCounts).forEach(([source, count]) => {
      console.log(`  ${source}: ${count}`);
    });

    console.log(`\n✅ Successfully matched uplines: ${uplineMatches.length}`);
    console.log(`❌ Failed to match uplines: ${uplineNoMatches.length}`);

    // Analyze NPN matching
    console.log('\n🔢 NPN MATCHING ANALYSIS');
    console.log('========================');

    const npnToContacts = new Map();
    allNodes.forEach(node => {
      if (node.npn) {
        if (!npnToContacts.has(node.npn)) {
          npnToContacts.set(node.npn, []);
        }
        npnToContacts.get(node.npn).push({
          id: node.id,
          label: node.label,
        });
      }
    });

    const duplicateNpns = Array.from(npnToContacts.entries()).filter(([npn, contacts]) => contacts.length > 1);
    console.log(`Total unique NPNs: ${npnToContacts.size}`);
    console.log(`Duplicate NPNs: ${duplicateNpns.length}`);

    if (duplicateNpns.length > 0) {
      console.log('\n⚠️  DUPLICATE NPNs (first 10):');
      duplicateNpns.slice(0, 10).forEach(([npn, contacts]) => {
        console.log(`  NPN ${npn}: ${contacts.length} contacts`);
        contacts.forEach(c => console.log(`    - ${c.label}`));
      });
    }

    // Check uplineProducerId matches
    console.log('\n🔍 UPLINE PRODUCER ID MATCHING');
    console.log('==============================');

    const uplineProducerIds = new Set();
    allNodes.forEach(node => {
      if (node.raw?.uplineProducerId) {
        uplineProducerIds.add(node.raw.uplineProducerId);
      }
    });

    console.log(`Total unique uplineProducerId values: ${uplineProducerIds.size}`);

    const matchedUplines = [];
    const unmatchedUplines = [];

    allNodes.forEach(node => {
      if (node.raw?.uplineProducerId) {
        const uplineId = node.raw.uplineProducerId;
        const matchingContacts = npnToContacts.get(uplineId) || [];
        
        if (matchingContacts.length > 0) {
          matchedUplines.push({
            contact: node.label,
            npn: node.npn,
            uplineProducerId: uplineId,
            matchedTo: matchingContacts.map(c => c.label).join(', '),
            actualParent: node.level > 0 ? 'Has parent' : 'No parent in hierarchy',
          });
        } else {
          unmatchedUplines.push({
            contact: node.label,
            npn: node.npn,
            uplineProducerId: uplineId,
          });
        }
      }
    });

    console.log(`\n✅ Uplines with matching NPNs: ${matchedUplines.length}`);
    console.log(`❌ Uplines without matching NPNs: ${unmatchedUplines.length}`);

    if (matchedUplines.length > 0) {
      console.log('\n📋 SAMPLE MATCHED UPLINES (first 10):');
      matchedUplines.slice(0, 10).forEach(match => {
        console.log(`  ${match.contact} (NPN: ${match.npn})`);
        console.log(`    → Looking for upline: ${match.uplineProducerId}`);
        console.log(`    → Found: ${match.matchedTo}`);
        console.log(`    → Status: ${match.actualParent}\n`);
      });
    }

    if (unmatchedUplines.length > 0) {
      console.log('\n⚠️  SAMPLE UNMATCHED UPLINES (first 10):');
      unmatchedUplines.slice(0, 10).forEach(unmatched => {
        console.log(`  ${unmatched.contact} (NPN: ${unmatched.npn || 'none'})`);
        console.log(`    → Looking for upline: ${unmatched.uplineProducerId}`);
        console.log(`    → Status: No contact found with this NPN\n`);
      });
    }

    // Check if hierarchy is actually being built
    console.log('\n🌳 HIERARCHY BUILD VERIFICATION');
    console.log('==============================');

    const nodesWithChildren = allNodes.filter(n => n.children && n.children.length > 0);
    const leafNodes = allNodes.filter(n => !n.children || n.children.length === 0);

    console.log(`Nodes with children: ${nodesWithChildren.length}`);
    console.log(`Leaf nodes: ${leafNodes.length}`);

    if (nodesWithChildren.length === 0) {
      console.log('\n⚠️  WARNING: No nodes have children! Hierarchy is completely flat.');
      console.log('   This suggests parent-child relationships are not being established.');
      console.log('\n   Possible causes:');
      console.log('   1. UplineProducerId values don\'t match any contact NPNs');
      console.log('   2. Data normalization issues (whitespace, formatting)');
      console.log('   3. All contacts are being marked as root nodes');
      console.log('   4. Cycle detection is breaking all relationships');
    } else {
      console.log('\n✅ Hierarchy structure is being built correctly');
      console.log('\nSample parent-child relationships:');
      nodesWithChildren.slice(0, 5).forEach(parent => {
        console.log(`  ${parent.label} (Level ${parent.level})`);
        parent.children.slice(0, 3).forEach(child => {
          console.log(`    └─ ${child.label} (Level ${child.level})`);
        });
        if (parent.children.length > 3) {
          console.log(`    └─ ... and ${parent.children.length - 3} more`);
        }
      });
    }

    // Summary
    console.log('\n📋 SUMMARY');
    console.log('==========');
    console.log(`Total contacts analyzed: ${allNodes.length}`);
    console.log(`Root nodes: ${snapshot.hierarchy.length}`);
    console.log(`Max hierarchy depth: ${maxDepth}`);
    console.log(`Nodes with children: ${nodesWithChildren.length}`);
    console.log(`Leaf nodes: ${leafNodes.length}`);
    console.log(`Successfully matched uplines: ${matchedUplines.length}`);
    console.log(`Unmatched uplines: ${unmatchedUplines.length}`);

  } catch (error) {
    console.error('❌ Error analyzing uplines:', error);
    console.error(error.stack);
  }
}

// Run the analysis
analyzeUplines();

